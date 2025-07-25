// updateMemoryFromResult.js — Poseidon Deep Learning Kernel (Autosave Edition, PPDA-Enhanced)

const memory = {};

export function updateMemoryFromResult(symbol, side, result, delta = 0, confidence = null, context = {}) {
  if (!symbol || !side) {
    console.warn('[DeepMemory] updateMemoryFromResult called with missing params:', { symbol, side, result });
    return;
  }

  side = side.toUpperCase();
  if (side === "BUY") side = "LONG";
  if (side === "SELL") side = "SHORT";

  console.log('[DeepMemory] Recording:', symbol, side, result, delta);

  if (!memory[symbol]) {
    memory[symbol] = { LONG: makeBase(), SHORT: makeBase() };
  }

  let m = memory[symbol][side];
  m.trades++;

  if (result === "win") {
    m.wins++;
    m.currentStreak = m.currentStreak >= 0 ? m.currentStreak + 1 : 1;
  } else {
    m.losses++;
    m.currentStreak = m.currentStreak <= 0 ? m.currentStreak - 1 : -1;
  }

  if (m.currentStreak > m.bestStreak) m.bestStreak = m.currentStreak;
  if (m.currentStreak < m.worstStreak) m.worstStreak = m.currentStreak;

  if (typeof delta === "number") m.roiHistory.push(delta);
  if (confidence !== null) m.confidenceHistory.push(confidence);

  if (m.roiHistory.length > 15) m.roiHistory.shift();
  if (m.confidenceHistory.length > 15) m.confidenceHistory.shift();

  m.contextHistory.push({
    result, delta, confidence,
    dcaCount: context.dcaCount ?? null,
    volume: context.volume ?? null,
    volatility: context.volatility ?? null,
    time: Date.now(),
    ppdaWinSide: context.ppdaWinSide ?? null,
    resolutionTime: context.resolutionTime ?? null,
    recoveredROI: context.recoveredROI ?? null,
    ...context
  });

  if (m.contextHistory.length > 30) m.contextHistory.shift();

  if (result === 'win' && (m.bestContext == null || delta > m.bestContext.delta)) {
    m.bestContext = {
      delta, confidence, ...context, time: Date.now()
    };
  }

  // === ✅ NEW: PPDA Recovery Stats Aggregation
  if (context.ppdaWinSide && context.recoveredROI) {
    if (!m.ppdaStats) m.ppdaStats = { recovered: [], avgRecovery: 0 };
    m.ppdaStats.recovered.push(context.recoveredROI);
    if (m.ppdaStats.recovered.length > 20) m.ppdaStats.recovered.shift();
    m.ppdaStats.avgRecovery = (
      m.ppdaStats.recovered.reduce((a, b) => a + parseFloat(b || 0), 0) / m.ppdaStats.recovered.length
    ).toFixed(2);
  }

  m.lastResult = result;
  m.lastTimestamp = Date.now();

  autosaveLearningMemory();
}

function makeBase() {
  return {
    wins: 0,
    losses: 0,
    trades: 0,
    currentStreak: 0,
    bestStreak: 0,
    worstStreak: 0,
    roiHistory: [],
    confidenceHistory: [],
    contextHistory: [],
    bestContext: null,
    ppdaStats: null,
    lastResult: null,
    lastTimestamp: null,
  };
}

export function getMemory(symbol = null) {
  if (symbol) return memory[symbol] || { LONG: makeBase(), SHORT: makeBase() };
  return memory;
}

export function getHotColdPairs(winThreshold = 0.65, minTrades = 1) {
  const arr = [];
  Object.keys(memory).forEach(symbol => {
    ["LONG", "SHORT"].forEach(side => {
      const m = memory[symbol][side];
      if (m.trades >= minTrades) {
        const winrate = m.wins / m.trades;
        arr.push({
          symbol, side,
          winrate,
          state: winrate >= winThreshold ? "hot" : (winrate <= 1 - winThreshold ? "cold" : "neutral"),
          streak: m.currentStreak,
        });
      }
    });
  });
  return arr;
}

export function getBestContext(symbol, side = "LONG") {
  side = side.toUpperCase();
  return memory[symbol]?.[side]?.bestContext ?? null;
}

export function exportLearningMemory() {
  return JSON.stringify(memory);
}

export function importLearningMemory(json) {
  try {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    Object.keys(data).forEach(sym => memory[sym] = data[sym]);
    return true;
  } catch (e) {
    return false;
  }
}

function autosaveLearningMemory() {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  try {
    fetch('/api/memory', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: exportLearningMemory()
    });
  } catch (err) {
    if (console && console.warn) console.warn("[Memory] Autosave failed:", err.message);
  }
}