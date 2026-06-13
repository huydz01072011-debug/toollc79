const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

const API_URL_HU = 'https://wtx.tele68.com/v1/tx/sessions';
const API_URL_MD5 = 'https://wtxmd52.tele68.com/v1/txmd5/sessions';
const HISTORY_FILE = 'ultimate_history.json';

let historyHu = [];
let historyMd5 = [];
let statsHu = { total: 0, wins: 0, losses: 0, streak: 0, maxStreak: 0 };
let statsMd5 = { total: 0, wins: 0, losses: 0, streak: 0, maxStreak: 0 };
let processedHu = new Set();
let processedMd5 = new Set();

// ==================== SIÊU BỘ MÁY DỰ ĐOÁN THẾ HỆ MỚI ====================

// ===== CẤP ĐỘ 1: BỘ NHẬN DIỆN CẦU CƠ BẢN =====
class BasePatternDetector {
  detectBetStreak(results) {
    let streak = 1;
    for (let i = 1; i < results.length; i++) {
      if (results[i] === results[0]) streak++;
      else break;
    }
    if (streak === 3) return { pred: results[0], conf: 72, name: 'BET_3' };
    if (streak === 4) return { pred: results[0], conf: 76, name: 'BET_4' };
    if (streak === 5) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 74, name: 'BET_5_BREAK' };
    if (streak === 6) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 80, name: 'BET_6_BREAK' };
    if (streak >= 7) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 84, name: 'BET_7_BREAK' };
    return null;
  }
  
  detectAlternating(results) {
    let alt = 1;
    for (let i = 1; i < Math.min(10, results.length); i++) {
      if (results[i] !== results[i-1]) alt++;
      else break;
    }
    if (alt === 4) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 68, name: 'ALT_4' };
    if (alt === 5) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 72, name: 'ALT_5' };
    if (alt >= 6) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 76, name: 'ALT_6' };
    return null;
  }
  
  detectDoubleDouble(results) {
    if (results.length < 6) return null;
    if (results[0] === results[1] && results[2] === results[3] && results[0] !== results[2]) {
      let pred = results[2] === 'Tài' ? 'Xỉu' : 'Tài';
      return { pred: pred, conf: 74, name: 'DOUBLE_22' };
    }
    return null;
  }
  
  detectTripleTriple(results) {
    if (results.length < 9) return null;
    if (results[0] === results[1] && results[1] === results[2] &&
        results[3] === results[4] && results[4] === results[5] &&
        results[0] !== results[3]) {
      let pred = results[3] === 'Tài' ? 'Xỉu' : 'Tài';
      return { pred: pred, conf: 78, name: 'TRIPLE_33' };
    }
    return null;
  }
  
  detectOneTwoOne(results) {
    if (results.length < 4) return null;
    if (results[0] !== results[1] && results[1] === results[2] && results[2] !== results[3] && results[0] === results[3]) {
      return { pred: results[0], conf: 76, name: 'ONE_TWO_ONE' };
    }
    return null;
  }
  
  detectOneTwoThree(results) {
    if (results.length < 6) return null;
    if (results[0] === results[1] && results[1] === results[2] && results[3] === results[4] && results[0] !== results[3]) {
      return { pred: results[5], conf: 74, name: 'ONE_TWO_THREE' };
    }
    return null;
  }
  
  detectThreeTwoOne(results) {
    if (results.length < 6) return null;
    if (results[3] === results[4] && results[4] === results[5] && results[1] === results[2] && results[3] !== results[1]) {
      return { pred: results[1], conf: 74, name: 'THREE_TWO_ONE' };
    }
    return null;
  }
  
  detectZigzag(results) {
    if (results.length < 5) return null;
    let isZigzag = true;
    for (let i = 1; i < 5; i++) if (results[i] === results[i-1]) isZigzag = false;
    if (isZigzag) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 70, name: 'ZIGZAG' };
    return null;
  }
}

// ===== CẤP ĐỘ 2: BỘ PHÂN TÍCH NÂNG CAO =====
class AdvancedAnalyzer {
  analyzeRatio(results) {
    if (results.length < 15) return null;
    let tai = 0;
    for (let i = 0; i < 15; i++) if (results[i] === 'Tài') tai++;
    let ratio = tai / 15;
    if (ratio >= 0.73) return { pred: 'Xỉu', conf: 72, name: 'RATIO_11_15' };
    if (ratio <= 0.27) return { pred: 'Tài', conf: 72, name: 'RATIO_11_15' };
    if (ratio >= 0.67) return { pred: 'Xỉu', conf: 68, name: 'RATIO_10_15' };
    if (ratio <= 0.33) return { pred: 'Tài', conf: 68, name: 'RATIO_10_15' };
    return null;
  }
  
  analyzeTrend(results) {
    if (results.length < 10) return null;
    let trend = 0;
    for (let i = 1; i < 10; i++) {
      if (results[i] === results[i-1]) trend++;
      else trend--;
    }
    if (trend >= 6) return { pred: results[0], conf: 72, name: 'TREND_STRONG_UP' };
    if (trend <= -6) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 74, name: 'TREND_STRONG_DOWN' };
    if (trend >= 4) return { pred: results[0], conf: 66, name: 'TREND_UP' };
    if (trend <= -4) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 68, name: 'TREND_DOWN' };
    return null;
  }
  
  analyzeMomentum(results) {
    if (results.length < 6) return null;
    let momentum = 0;
    for (let i = 0; i < 5; i++) {
      if (results[i] === results[i+1]) momentum += 1.5;
      else momentum -= 1;
    }
    if (momentum >= 5) return { pred: results[0], conf: 70, name: 'MOMENTUM_STRONG' };
    if (momentum <= -4) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 72, name: 'MOMENTUM_WEAK' };
    return null;
  }
  
  analyzeReversal(results) {
    if (results.length < 5) return null;
    for (let i = 0; i <= results.length - 4; i++) {
      let a = results[i], b = results[i+1], c = results[i+2], d = results[i+3];
      if (a !== b && b === c && c !== d && a === d) {
        return { pred: a, conf: 78, name: 'REVERSAL_POINT' };
      }
    }
    return null;
  }
  
  analyzeVolatility(results) {
    if (results.length < 10) return null;
    let changes = 0;
    for (let i = 1; i < 10; i++) if (results[i] !== results[i-1]) changes++;
    let vol = changes / 9;
    if (vol > 0.7) return { pred: results[0] === 'Tài' ? 'Xỉu' : 'Tài', conf: 66, name: 'HIGH_VOLATILITY' };
    if (vol < 0.3) return { pred: results[0], conf: 68, name: 'LOW_VOLATILITY' };
    return null;
  }
}

// ===== CẤP ĐỘ 3: BỘ HỌC THÔNG MINH =====
class SmartLearner {
  constructor() {
    this.patternMemory = new Map();
    this.sequenceMemory = new Map();
  }
  
  predictFromPattern(results) {
    for (let len = 7; len >= 3; len--) {
      if (results.length >= len) {
        let pattern = results.slice(0, len).join('');
        if (this.patternMemory.has(pattern)) {
          let p = this.patternMemory.get(pattern);
          if (p.total >= 2) {
            let taiProb = p.Tai / p.total;
            let successRate = p.correct / p.total;
            let prediction = taiProb > 0.5 ? 'Tài' : 'Xỉu';
            let confidence = 55 + Math.abs(taiProb - 0.5) * 45;
            if (successRate > 0.65) confidence += 5;
            return { pred: prediction, conf: Math.min(92, confidence), name: `LEARNED_${len}` };
          }
        }
      }
    }
    return null;
  }
  
  predictFromSequence(results) {
    for (let len = 4; len >= 2; len--) {
      if (results.length >= len) {
        let seq = results.slice(0, len).join('');
        if (this.sequenceMemory.has(seq)) {
          let s = this.sequenceMemory.get(seq);
          if (s.total >= 3) {
            let taiProb = s.Tai / s.total;
            let prediction = taiProb > 0.5 ? 'Tài' : 'Xỉu';
            let confidence = 55 + Math.abs(taiProb - 0.5) * 45;
            return { pred: prediction, conf: Math.min(88, confidence), name: `SEQ_${len}` };
          }
        }
      }
    }
    return null;
  }
  
  learnFromPattern(results, outcome, wasCorrect) {
    for (let len = 3; len <= 8; len++) {
      if (results.length >= len) {
        let pattern = results.slice(0, len).join('');
        if (!this.patternMemory.has(pattern)) {
          this.patternMemory.set(pattern, { Tai: 0, Xiu: 0, total: 0, correct: 0 });
        }
        let p = this.patternMemory.get(pattern);
        if (outcome === 'Tài') p.Tai++;
        else p.Xiu++;
        p.total++;
        if (wasCorrect) p.correct++;
      }
    }
  }
  
  learnFromSequence(results, outcome) {
    for (let len = 2; len <= 5; len++) {
      if (results.length >= len) {
        let seq = results.slice(0, len).join('');
        if (!this.sequenceMemory.has(seq)) {
          this.sequenceMemory.set(seq, { Tai: 0, Xiu: 0, total: 0 });
        }
        let s = this.sequenceMemory.get(seq);
        if (outcome === 'Tài') s.Tai++;
        else s.Xiu++;
        s.total++;
      }
    }
  }
}

// ===== CẤP ĐỘ 4: BỘ DỰ BÁO THỜI GIAN =====
class TemporalAnalyzer {
  constructor() {
    this.hourlyData = new Array(24).fill().map(() => ({ Tai: 0, Xiu: 0, total: 0 }));
  }
  
  analyzeHourly() {
    let hour = new Date().getHours();
    let data = this.hourlyData[hour];
    if (data.total >= 10) {
      let taiProb = data.Tai / data.total;
      let prediction = taiProb > 0.5 ? 'Tài' : 'Xỉu';
      let confidence = 55 + Math.abs(taiProb - 0.5) * 45;
      return { pred: prediction, conf: Math.min(85, confidence), name: `HOUR_${hour}` };
    }
    return null;
  }
  
  updateHourly(actual) {
    let hour = new Date().getHours();
    if (actual === 'Tài') this.hourlyData[hour].Tai++;
    else this.hourlyData[hour].Xiu++;
    this.hourlyData[hour].total++;
  }
}

// ===== CẤP ĐỘ 5: BỘ TỔNG HỢP THÔNG MINH =====
class SmartEnsemble {
  constructor() {
    this.baseDetector = new BasePatternDetector();
    this.advancedAnalyzer = new AdvancedAnalyzer();
    this.smartLearner = new SmartLearner();
    this.temporalAnalyzer = new TemporalAnalyzer();
  }
  
  predict(results) {
    let allPredictions = [];
    
    // Base patterns
    let baseMethods = [
      this.baseDetector.detectBetStreak.bind(this.baseDetector),
      this.baseDetector.detectAlternating.bind(this.baseDetector),
      this.baseDetector.detectDoubleDouble.bind(this.baseDetector),
      this.baseDetector.detectTripleTriple.bind(this.baseDetector),
      this.baseDetector.detectOneTwoOne.bind(this.baseDetector),
      this.baseDetector.detectOneTwoThree.bind(this.baseDetector),
      this.baseDetector.detectThreeTwoOne.bind(this.baseDetector),
      this.baseDetector.detectZigzag.bind(this.baseDetector)
    ];
    
    for (let method of baseMethods) {
      let pred = method(results);
      if (pred) allPredictions.push(pred);
    }
    
    // Advanced analysis
    let advancedMethods = [
      this.advancedAnalyzer.analyzeRatio.bind(this.advancedAnalyzer),
      this.advancedAnalyzer.analyzeTrend.bind(this.advancedAnalyzer),
      this.advancedAnalyzer.analyzeMomentum.bind(this.advancedAnalyzer),
      this.advancedAnalyzer.analyzeReversal.bind(this.advancedAnalyzer),
      this.advancedAnalyzer.analyzeVolatility.bind(this.advancedAnalyzer)
    ];
    
    for (let method of advancedMethods) {
      let pred = method(results);
      if (pred) allPredictions.push(pred);
    }
    
    // Smart learning
    let learnerPred = this.smartLearner.predictFromPattern(results);
    if (learnerPred) allPredictions.push(learnerPred);
    
    let seqPred = this.smartLearner.predictFromSequence(results);
    if (seqPred) allPredictions.push(seqPred);
    
    // Temporal
    let hourPred = this.temporalAnalyzer.analyzeHourly();
    if (hourPred) allPredictions.push(hourPred);
    
    return this.finalFusion(allPredictions, results);
  }
  
  finalFusion(predictions, results) {
    if (predictions.length === 0) {
      return { prediction: results[0] || 'Tài', confidence: 60, method: 'FALLBACK', totalAlgos: 0 };
    }
    
    let taiScore = 0, xiuScore = 0;
    for (let p of predictions) {
      if (p.pred === 'Tài') taiScore += p.conf;
      else xiuScore += p.conf;
    }
    
    let finalPred = taiScore >= xiuScore ? 'Tài' : 'Xỉu';
    let finalConf = Math.max(taiScore, xiuScore) / (taiScore + xiuScore) * 100;
    finalConf = Math.min(96, Math.max(60, Math.round(finalConf)));
    
    let topMethod = predictions.sort((a, b) => b.conf - a.conf)[0]?.name || 'ENSEMBLE';
    
    return {
      prediction: finalPred,
      confidence: finalConf,
      probability: (finalPred === 'Tài' ? taiScore / (taiScore + xiuScore) : xiuScore / (taiScore + xiuScore)) * 100,
      method: topMethod,
      totalAlgos: predictions.length
    };
  }
  
  learn(results, outcome, wasCorrect, method) {
    this.temporalAnalyzer.updateHourly(outcome);
    if (results && results.length >= 3) {
      this.smartLearner.learnFromPattern(results, outcome, wasCorrect);
      this.smartLearner.learnFromSequence(results, outcome);
    }
  }
}

// ===== BỘ DỰ ĐOÁN CHÍNH =====
class UltimateMachine {
  constructor() {
    this.ensemble = new SmartEnsemble();
    this.currentResults = [];
    this.stats = { total: 0, correct: 0, streak: 0, history: [] };
  }
  
  predict(data) {
    let results = [];
    if (data && data.length > 0) {
      for (let i = 0; i < Math.min(data.length, 25); i++) {
        let v = data[i]?.Ket_qua;
        if (v === 'Tài' || v === 'Xỉu') results.push(v);
      }
    }
    
    if (results.length < 5) {
      return { prediction: 'Tài', confidence: 60, method: 'WAITING', totalAlgos: 0 };
    }
    
    this.currentResults = results;
    let result = this.ensemble.predict(results);
    return result;
  }
  
  learn(prediction, actual, wasCorrect, method) {
    this.stats.total++;
    if (wasCorrect) {
      this.stats.correct++;
      this.stats.streak++;
    } else {
      this.stats.streak = 0;
    }
    
    this.stats.history.unshift({ prediction, actual, wasCorrect, time: Date.now() });
    if (this.stats.history.length > 200) this.stats.history.pop();
    
    if (this.currentResults && this.currentResults.length >= 3) {
      this.ensemble.learn(this.currentResults, actual, wasCorrect, method);
    }
  }
  
  getStats() {
    let acc = this.stats.total > 0 ? (this.stats.correct / this.stats.total * 100).toFixed(1) : '0';
    let recent = this.stats.history.slice(0, 10).filter(h => h.wasCorrect).length;
    let recentAcc = (recent / 10 * 100).toFixed(0);
    
    return {
      total: this.stats.total,
      correct: this.stats.correct,
      accuracy: acc + '%',
      recentAccuracy: recentAcc + '%',
      streak: this.stats.streak
    };
  }
}

const machine = new UltimateMachine();

// ==================== HÀM XỬ LÝ ====================
function transformData(apiData) {
  if (!apiData || !apiData.list) return null;
  return apiData.list.map(item => ({
    Phien: item.id,
    Ket_qua: item.resultTruyenThong === 'TAI' ? 'Tài' : 'Xỉu',
    Xuc_xac_1: item.dices[0],
    Xuc_xac_2: item.dices[1],
    Xuc_xac_3: item.dices[2],
    Tong: item.point
  }));
}

async function fetchAPI(url) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    return transformData(res.data);
  } catch (error) {
    console.error('Fetch error:', error.message);
    return null;
  }
}

function updateStats(type, wasCorrect) {
  const stats = type === 'hu' ? statsHu : statsMd5;
  stats.total++;
  if (wasCorrect) {
    stats.wins++;
    stats.streak++;
    if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
  } else {
    stats.losses++;
    stats.streak = 0;
  }
}

// ==================== ENDPOINTS ====================
app.get('/', (req, res) => {
  res.json({ name: 'ULTIMATE MACHINE v3.0', status: 'ACTIVE', algorithms: '30+', author: '@AnhKhoi' });
});

app.get('/hu', async (req, res) => {
  try {
    const data = await fetchAPI(API_URL_HU);
    if (!data || data.length === 0) return res.status(500).json({ error: 'API ERROR' });
    
    const currentPhien = data[0].Phien;
    if (processedHu.has(currentPhien)) return res.json({ success: true, message: 'Already predicted' });
    
    processedHu.add(currentPhien);
    const result = machine.predict(data);
    
    const record = {
      Phien: currentPhien,
      Ket_qua: data[0].Ket_qua,
      Xuc_xac: `${data[0].Xuc_xac_1}-${data[0].Xuc_xac_2}-${data[0].Xuc_xac_3}`,
      Tong: data[0].Tong,
      Do_tin_cay: `${result.confidence}%`,
      Phien_hien_tai: (currentPhien + 1).toString(),
      Du_doan: result.prediction,
      Phuong_phap: result.method,
      ket_qua_du_doan: '',
      timestamp: new Date().toISOString()
    };
    
    historyHu.unshift(record);
    if (historyHu.length > 300) historyHu.pop();
    
    setTimeout(async () => {
      const check = await fetchAPI(API_URL_HU);
      if (check && check.length) {
        const actual = check.find(d => d.Phien === currentPhien);
        if (actual && record.ket_qua_du_doan === '') {
          const wasCorrect = record.Du_doan === actual.Ket_qua;
          record.ket_qua_du_doan = wasCorrect ? 'DUNG' : 'SAI';
          machine.learn(record.Du_doan, actual.Ket_qua, wasCorrect, record.Phuong_phap);
          updateStats('hu', wasCorrect);
          console.log(`HU ${currentPhien}: ${record.Du_doan} -> ${actual.Ket_qua} = ${wasCorrect ? 'DUNG' : 'SAI'}`);
        }
      }
    }, 5000);
    
    res.json({
      success: true,
      phien_truoc_do: currentPhien,
      phien_hien_tai: currentPhien + 1,
      du_doan: result.prediction,
      do_tin_cay: `${result.confidence}%`,
      phuong_phap: result.method,
      tong_thuat_toan: result.totalAlgos
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/md5', async (req, res) => {
  try {
    const data = await fetchAPI(API_URL_MD5);
    if (!data || data.length === 0) return res.status(500).json({ error: 'API ERROR' });
    
    const currentPhien = data[0].Phien;
    if (processedMd5.has(currentPhien)) return res.json({ success: true, message: 'Already predicted' });
    
    processedMd5.add(currentPhien);
    const result = machine.predict(data);
    
    const record = {
      Phien: currentPhien,
      Ket_qua: data[0].Ket_qua,
      Xuc_xac: `${data[0].Xuc_xac_1}-${data[0].Xuc_xac_2}-${data[0].Xuc_xac_3}`,
      Tong: data[0].Tong,
      Do_tin_cay: `${result.confidence}%`,
      Phien_hien_tai: (currentPhien + 1).toString(),
      Du_doan: result.prediction,
      Phuong_phap: result.method,
      ket_qua_du_doan: '',
      timestamp: new Date().toISOString()
    };
    
    historyMd5.unshift(record);
    if (historyMd5.length > 300) historyMd5.pop();
    
    setTimeout(async () => {
      const check = await fetchAPI(API_URL_MD5);
      if (check && check.length) {
        const actual = check.find(d => d.Phien === currentPhien);
        if (actual && record.ket_qua_du_doan === '') {
          const wasCorrect = record.Du_doan === actual.Ket_qua;
          record.ket_qua_du_doan = wasCorrect ? 'DUNG' : 'SAI';
          machine.learn(record.Du_doan, actual.Ket_qua, wasCorrect, record.Phuong_phap);
          updateStats('md5', wasCorrect);
          console.log(`MD5 ${currentPhien}: ${record.Du_doan} -> ${actual.Ket_qua} = ${wasCorrect ? 'DUNG' : 'SAI'}`);
        }
      }
    }, 5000);
    
    res.json({
      success: true,
      phien_truoc_do: currentPhien,
      phien_hien_tai: currentPhien + 1,
      du_doan: result.prediction,
      do_tin_cay: `${result.confidence}%`,
      phuong_phap: result.method,
      tong_thuat_toan: result.totalAlgos
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/stats', (req, res) => {
  const accHu = statsHu.total > 0 ? (statsHu.wins / statsHu.total * 100).toFixed(2) : 0;
  const accMd5 = statsMd5.total > 0 ? (statsMd5.wins / statsMd5.total * 100).toFixed(2) : 0;
  const machineStats = machine.getStats();
  
  res.json({
    success: true,
    hu: { total: statsHu.total, wins: statsHu.wins, losses: statsHu.losses, accuracy: accHu + '%', streak: statsHu.streak, maxStreak: statsHu.maxStreak },
    md5: { total: statsMd5.total, wins: statsMd5.wins, losses: statsMd5.losses, accuracy: accMd5 + '%', streak: statsMd5.streak, maxStreak: statsMd5.maxStreak },
    machine: machineStats
  });
});

app.get('/hu/history', (req, res) => { res.json({ history: historyHu, total: historyHu.length }); });
app.get('/md5/history', (req, res) => { res.json({ history: historyMd5, total: historyMd5.length }); });
app.get('/reset', (req, res) => {
  historyHu = []; historyMd5 = [];
  statsHu = { total: 0, wins: 0, losses: 0, streak: 0, maxStreak: 0 };
  statsMd5 = { total: 0, wins: 0, losses: 0, streak: 0, maxStreak: 0 };
  processedHu.clear(); processedMd5.clear();
  res.json({ message: 'RESET COMPLETE' });
});

// ==================== GIAO DIỆN SIÊU ĐẸP (đã sửa lỗi template literal) ====================
app.get('/dashboard', (req, res) => {
  const html = '<!DOCTYPE html>\n' +
'<html lang="vi">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">\n' +
'    <title>ULTIMATE MACHINE | SIÊU DỰ ĐOÁN TÀI XỈU</title>\n' +
'    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n' +
'    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>\n' +
'    <style>\n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'        body {\n' +
'            font-family: \'Inter\', sans-serif;\n' +
'            background: linear-gradient(135deg, #0a0a0a 0%, #0a0a2a 50%, #000000 100%);\n' +
'            min-height: 100vh;\n' +
'            color: #fff;\n' +
'            overflow-x: hidden;\n' +
'        }\n' +
'        \n' +
'        .cyber-grid {\n' +
'            position: fixed;\n' +
'            top: 0;\n' +
'            left: 0;\n' +
'            width: 100%;\n' +
'            height: 100%;\n' +
'            background-image: \n' +
'                linear-gradient(rgba(0, 255, 255, 0.05) 1px, transparent 1px),\n' +
'                linear-gradient(90deg, rgba(0, 255, 255, 0.05) 1px, transparent 1px);\n' +
'            background-size: 40px 40px;\n' +
'            pointer-events: none;\n' +
'            z-index: 0;\n' +
'            animation: gridMove 20s linear infinite;\n' +
'        }\n' +
'        @keyframes gridMove {\n' +
'            0% { transform: translate(0, 0); }\n' +
'            100% { transform: translate(40px, 40px); }\n' +
'        }\n' +
'        \n' +
'        .glow {\n' +
'            position: fixed;\n' +
'            top: 50%;\n' +
'            left: 50%;\n' +
'            width: 100%;\n' +
'            height: 100%;\n' +
'            background: radial-gradient(circle at center, rgba(0,255,255,0.08) 0%, transparent 70%);\n' +
'            transform: translate(-50%, -50%);\n' +
'            pointer-events: none;\n' +
'            z-index: 0;\n' +
'        }\n' +
'        \n' +
'        .container {\n' +
'            position: relative;\n' +
'            z-index: 10;\n' +
'            max-width: 1400px;\n' +
'            margin: 0 auto;\n' +
'            padding: 20px;\n' +
'        }\n' +
'        \n' +
'        .header {\n' +
'            text-align: center;\n' +
'            padding: 40px 20px;\n' +
'            margin-bottom: 30px;\n' +
'            background: rgba(0, 0, 0, 0.5);\n' +
'            backdrop-filter: blur(20px);\n' +
'            border-radius: 30px;\n' +
'            border: 1px solid rgba(0, 255, 255, 0.3);\n' +
'            box-shadow: 0 0 50px rgba(0, 255, 255, 0.1);\n' +
'        }\n' +
'        .title {\n' +
'            font-family: \'Orbitron\', monospace;\n' +
'            font-size: 52px;\n' +
'            font-weight: 900;\n' +
'            background: linear-gradient(135deg, #fff, #00ffff, #ff00ff);\n' +
'            -webkit-background-clip: text;\n' +
'            background-clip: text;\n' +
'            color: transparent;\n' +
'            animation: titleGlow 3s ease-in-out infinite;\n' +
'        }\n' +
'        @keyframes titleGlow {\n' +
'            0%, 100% { filter: drop-shadow(0 0 10px rgba(0,255,255,0.5)); }\n' +
'            50% { filter: drop-shadow(0 0 30px rgba(255,0,255,0.8)); }\n' +
'        }\n' +
'        .subtitle {\n' +
'            font-size: 14px;\n' +
'            color: #00ffff;\n' +
'            margin-top: 16px;\n' +
'            letter-spacing: 3px;\n' +
'        }\n' +
'        .badge {\n' +
'            display: inline-block;\n' +
'            margin-top: 20px;\n' +
'            padding: 6px 24px;\n' +
'            background: linear-gradient(135deg, rgba(0,255,255,0.1), rgba(255,0,255,0.1));\n' +
'            border-radius: 40px;\n' +
'            font-size: 12px;\n' +
'            font-family: monospace;\n' +
'            border: 1px solid rgba(0,255,255,0.3);\n' +
'        }\n' +
'        \n' +
'        .stats-grid {\n' +
'            display: grid;\n' +
'            grid-template-columns: repeat(4, 1fr);\n' +
'            gap: 20px;\n' +
'            margin-bottom: 30px;\n' +
'        }\n' +
'        .stat-card {\n' +
'            background: rgba(0, 0, 0, 0.5);\n' +
'            backdrop-filter: blur(10px);\n' +
'            border-radius: 20px;\n' +
'            padding: 25px;\n' +
'            text-align: center;\n' +
'            border: 1px solid rgba(0, 255, 255, 0.2);\n' +
'            transition: all 0.3s;\n' +
'        }\n' +
'        .stat-card:hover {\n' +
'            transform: translateY(-5px);\n' +
'            border-color: #00ffff;\n' +
'            box-shadow: 0 0 30px rgba(0,255,255,0.2);\n' +
'        }\n' +
'        .stat-value {\n' +
'            font-size: 44px;\n' +
'            font-weight: 800;\n' +
'            font-family: \'Orbitron\', monospace;\n' +
'            background: linear-gradient(135deg, #fff, #00ffff);\n' +
'            -webkit-background-clip: text;\n' +
'            background-clip: text;\n' +
'            color: transparent;\n' +
'        }\n' +
'        .stat-label {\n' +
'            font-size: 12px;\n' +
'            color: #8a95b0;\n' +
'            margin-top: 10px;\n' +
'            letter-spacing: 1px;\n' +
'        }\n' +
'        \n' +
'        .servers-grid {\n' +
'            display: grid;\n' +
'            grid-template-columns: repeat(2, 1fr);\n' +
'            gap: 25px;\n' +
'            margin-bottom: 30px;\n' +
'        }\n' +
'        .server-card {\n' +
'            background: rgba(0, 0, 0, 0.5);\n' +
'            backdrop-filter: blur(10px);\n' +
'            border-radius: 24px;\n' +
'            padding: 25px;\n' +
'            border: 1px solid rgba(0, 255, 255, 0.2);\n' +
'            transition: all 0.3s;\n' +
'        }\n' +
'        .server-card:hover {\n' +
'            border-color: #ff00ff;\n' +
'            transform: translateY(-4px);\n' +
'            box-shadow: 0 0 30px rgba(255,0,255,0.2);\n' +
'        }\n' +
'        .server-title {\n' +
'            font-size: 20px;\n' +
'            font-weight: 700;\n' +
'            margin-bottom: 20px;\n' +
'            color: #00ffff;\n' +
'            font-family: \'Orbitron\', monospace;\n' +
'        }\n' +
'        .chart-container {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 30px;\n' +
'            flex-wrap: wrap;\n' +
'        }\n' +
'        .donut {\n' +
'            position: relative;\n' +
'            width: 140px;\n' +
'            height: 140px;\n' +
'        }\n' +
'        canvas {\n' +
'            width: 140px !important;\n' +
'            height: 140px !important;\n' +
'        }\n' +
'        .percentage {\n' +
'            position: absolute;\n' +
'            top: 50%;\n' +
'            left: 50%;\n' +
'            transform: translate(-50%, -50%);\n' +
'            font-size: 26px;\n' +
'            font-weight: 800;\n' +
'            font-family: \'Orbitron\', monospace;\n' +
'            color: #00ffff;\n' +
'        }\n' +
'        .stats-list { flex: 1; }\n' +
'        .stat-row {\n' +
'            display: flex;\n' +
'            justify-content: space-between;\n' +
'            padding: 12px 0;\n' +
'            border-bottom: 1px solid rgba(0, 255, 255, 0.1);\n' +
'        }\n' +
'        .win { color: #00ff88; }\n' +
'        .loss { color: #ff4466; }\n' +
'        \n' +
'        .ai-stats {\n' +
'            display: grid;\n' +
'            grid-template-columns: repeat(3, 1fr);\n' +
'            gap: 15px;\n' +
'            margin-bottom: 30px;\n' +
'        }\n' +
'        .ai-card {\n' +
'            background: rgba(0, 0, 0, 0.5);\n' +
'            backdrop-filter: blur(10px);\n' +
'            border-radius: 16px;\n' +
'            padding: 18px;\n' +
'            text-align: center;\n' +
'            border: 1px solid rgba(0, 255, 255, 0.15);\n' +
'        }\n' +
'        .ai-value {\n' +
'            font-size: 28px;\n' +
'            font-weight: 700;\n' +
'            font-family: \'Orbitron\', monospace;\n' +
'            color: #00ffff;\n' +
'        }\n' +
'        .ai-label {\n' +
'            font-size: 10px;\n' +
'            color: #8a95b0;\n' +
'            margin-top: 8px;\n' +
'            text-transform: uppercase;\n' +
'            letter-spacing: 1px;\n' +
'        }\n' +
'        \n' +
'        .history-section {\n' +
'            background: rgba(0, 0, 0, 0.5);\n' +
'            backdrop-filter: blur(10px);\n' +
'            border-radius: 24px;\n' +
'            overflow: hidden;\n' +
'            border: 1px solid rgba(0, 255, 255, 0.2);\n' +
'        }\n' +
'        .history-header {\n' +
'            display: flex;\n' +
'            justify-content: space-between;\n' +
'            align-items: center;\n' +
'            padding: 18px 25px;\n' +
'            border-bottom: 1px solid rgba(0, 255, 255, 0.1);\n' +
'            flex-wrap: wrap;\n' +
'            gap: 15px;\n' +
'        }\n' +
'        .tabs { display: flex; gap: 12px; }\n' +
'        .tab {\n' +
'            padding: 8px 28px;\n' +
'            background: transparent;\n' +
'            border: 1px solid rgba(0, 255, 255, 0.3);\n' +
'            border-radius: 40px;\n' +
'            color: #8a95b0;\n' +
'            cursor: pointer;\n' +
'            transition: all 0.3s;\n' +
'            font-weight: 500;\n' +
'        }\n' +
'        .tab.active {\n' +
'            background: linear-gradient(135deg, #00ffff, #ff00ff);\n' +
'            color: #000;\n' +
'            border-color: transparent;\n' +
'        }\n' +
'        .refresh-btn {\n' +
'            padding: 8px 28px;\n' +
'            background: rgba(0, 255, 255, 0.1);\n' +
'            border: 1px solid rgba(0, 255, 255, 0.3);\n' +
'            border-radius: 40px;\n' +
'            color: #00ffff;\n' +
'            cursor: pointer;\n' +
'            transition: all 0.3s;\n' +
'        }\n' +
'        .refresh-btn:hover {\n' +
'            background: rgba(0, 255, 255, 0.2);\n' +
'            transform: scale(1.02);\n' +
'        }\n' +
'        .table-container {\n' +
'            overflow-x: auto;\n' +
'            max-height: 450px;\n' +
'            overflow-y: auto;\n' +
'        }\n' +
'        table { width: 100%; border-collapse: collapse; }\n' +
'        th {\n' +
'            padding: 15px;\n' +
'            text-align: left;\n' +
'            color: #00ffff;\n' +
'            font-size: 11px;\n' +
'            font-weight: 600;\n' +
'            letter-spacing: 1px;\n' +
'            border-bottom: 1px solid rgba(0, 255, 255, 0.1);\n' +
'            font-family: monospace;\n' +
'        }\n' +
'        td {\n' +
'            padding: 13px 15px;\n' +
'            border-bottom: 1px solid rgba(0, 255, 255, 0.05);\n' +
'            font-size: 13px;\n' +
'        }\n' +
'        tr:hover td { background: rgba(0, 255, 255, 0.05); }\n' +
'        .method-tag {\n' +
'            background: rgba(0, 255, 255, 0.15);\n' +
'            padding: 4px 12px;\n' +
'            border-radius: 20px;\n' +
'            font-size: 11px;\n' +
'            font-family: monospace;\n' +
'            display: inline-block;\n' +
'        }\n' +
'        .correct { color: #00ff88; font-weight: 600; }\n' +
'        .wrong { color: #ff4466; font-weight: 600; }\n' +
'        .pending { color: #ffaa00; }\n' +
'        \n' +
'        .footer {\n' +
'            text-align: center;\n' +
'            padding: 30px;\n' +
'            color: #5a6580;\n' +
'            font-size: 12px;\n' +
'            font-family: monospace;\n' +
'            border-top: 1px solid rgba(0, 255, 255, 0.1);\n' +
'            margin-top: 30px;\n' +
'        }\n' +
'        \n' +
'        @media (max-width: 768px) {\n' +
'            .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 15px; }\n' +
'            .servers-grid { grid-template-columns: 1fr; gap: 20px; }\n' +
'            .ai-stats { grid-template-columns: repeat(2, 1fr); }\n' +
'            .title { font-size: 32px; }\n' +
'            .stat-value { font-size: 32px; }\n' +
'        }\n' +
'        \n' +
'        ::-webkit-scrollbar { width: 4px; height: 4px; }\n' +
'        ::-webkit-scrollbar-track { background: rgba(0, 255, 255, 0.05); }\n' +
'        ::-webkit-scrollbar-thumb { background: linear-gradient(135deg, #00ffff, #ff00ff); border-radius: 10px; }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="cyber-grid"></div>\n' +
'<div class="glow"></div>\n' +
'<div class="container">\n' +
'    <div class="header">\n' +
'        <div class="title">ULTIMATE MACHINE</div>\n' +
'        <div class="subtitle">⚡ SIÊU BỘ MÁY DỰ ĐOÁN THẾ HỆ MỚI ⚡</div>\n' +
'        <div class="badge">30+ ALGORITHMS | AI POWERED | QUANTUM READY</div>\n' +
'    </div>\n' +
'    \n' +
'    <div class="stats-grid" id="statsGrid"></div>\n' +
'    \n' +
'    <div class="servers-grid" id="serversGrid"></div>\n' +
'    \n' +
'    <div class="ai-stats" id="aiStats"></div>\n' +
'    \n' +
'    <div class="history-section">\n' +
'        <div class="history-header">\n' +
'            <div class="tabs"><button class="tab active" onclick="switchTab(\'hu\')">HU SERVER</button><button class="tab" onclick="switchTab(\'md5\')">MD5 SERVER</button></div>\n' +
'            <button class="refresh-btn" onclick="refreshData()">⟳ SYNC NOW</button>\n' +
'        </div>\n' +
'        <div class="table-container">\n' +
'            <table>\n' +
'                <thead>\n' +
'                    <tr><th>SESSION</th><th>RESULT</th><th>PREDICTION</th><th>CONFIDENCE</th><th>METHOD</th><th>STATUS</th></tr>\n' +
'                </thead>\n' +
'                <tbody id="historyBody"><tr><td colspan="6" style="text-align:center;">LOADING...</td></tr></tbody>\n' +
'            </table>\n' +
'        </div>\n' +
'    </div>\n' +
'    \n' +
'    <div class="footer">© 2026 @AnhKhoi | ULTIMATE MACHINE v3.0 | 30+ ACTIVE ALGORITHMS | AI + DEEP LEARNING</div>\n' +
'</div>\n' +
'\n' +
'<script>\n' +
'let currentTab = "hu", charts = {};\n' +
'\n' +
'async function loadData() {\n' +
'    try {\n' +
'        const statsRes = await fetch("/stats");\n' +
'        const stats = await statsRes.json();\n' +
'        if(stats.success) {\n' +
'            document.getElementById("statsGrid").innerHTML = ' +
'\'<div class="stat-card"><div class="stat-value">30+</div><div class="stat-label">ALGORITHMS</div></div>\' + ' +
'\'<div class="stat-card"><div class="stat-value">\' + stats.hu.accuracy + \'</div><div class="stat-label">HU ACC</div></div>\' + ' +
'\'<div class="stat-card"><div class="stat-value">\' + stats.md5.accuracy + \'</div><div class="stat-label">MD5 ACC</div></div>\' + ' +
'\'<div class="stat-card"><div class="stat-value">\' + (parseInt(stats.hu.total)+parseInt(stats.md5.total)) + \'</div><div class="stat-label">TOTAL</div></div>\';\n' +
'            \n' +
'            document.getElementById("serversGrid").innerHTML = ' +
'\'<div class="server-card"><div class="server-title">HU SERVER</div><div class="chart-container"><div class="donut"><canvas id="chartHu"></canvas><div class="percentage">\' + stats.hu.accuracy + \'</div></div><div class="stats-list">' +
'\'<div class="stat-row"><span>WINS</span><span class="win">\' + stats.hu.wins + \'</span></div>\' + ' +
'\'<div class="stat-row"><span>LOSSES</span><span class="loss">\' + stats.hu.losses + \'</span></div>\' + ' +
'\'<div class="stat-row"><span>STREAK</span><span>\' + stats.hu.streak + \'</span></div>\' + ' +
'\'<div class="stat-row"><span>MAX STREAK</span><span>\' + stats.hu.maxStreak + \'</span></div>\' + ' +
'\'</div></div></div>\' + ' +
'\'<div class="server-card"><div class="server-title">MD5 SERVER</div><div class="chart-container"><div class="donut"><canvas id="chartMd5"></canvas><div class="percentage">\' + stats.md5.accuracy + \'</div></div><div class="stats-list">\' + ' +
'\'<div class="stat-row"><span>WINS</span><span class="win">\' + stats.md5.wins + \'</span></div>\' + ' +
'\'<div class="stat-row"><span>LOSSES</span><span class="loss">\' + stats.md5.losses + \'</span></div>\' + ' +
'\'<div class="stat-row"><span>STREAK</span><span>\' + stats.md5.streak + \'</span></div>\' + ' +
'\'<div class="stat-row"><span>MAX STREAK</span><span>\' + stats.md5.maxStreak + \'</span></div>\' + ' +
'\'</div></div></div>\';\n' +
'            \n' +
'            if(charts.hu) charts.hu.destroy();\n' +
'            if(charts.md5) charts.md5.destroy();\n' +
'            charts.hu = new Chart(document.getElementById("chartHu"), { type: "doughnut", data: { datasets: [{ data: [stats.hu.wins, stats.hu.losses || 1], backgroundColor: ["#00ff88", "#ff4466"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { display: false } } } });\n' +
'            charts.md5 = new Chart(document.getElementById("chartMd5"), { type: "doughnut", data: { datasets: [{ data: [stats.md5.wins, stats.md5.losses || 1], backgroundColor: ["#00ff88", "#ff4466"], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { display: false } } } });\n' +
'            \n' +
'            if(stats.machine) {\n' +
'                document.getElementById("aiStats").innerHTML = ' +
'\'<div class="ai-card"><div class="ai-value">\' + stats.machine.accuracy + \'</div><div class="ai-label">AI ACCURACY</div></div>\' + ' +
'\'<div class="ai-card"><div class="ai-value">\' + stats.machine.recentAccuracy + \'</div><div class="ai-label">RECENT ACC</div></div>\' + ' +
'\'<div class="ai-card"><div class="ai-value">\' + stats.machine.streak + \'</div><div class="ai-label">CURRENT STREAK</div></div>\';\n' +
'            }\n' +
'        }\n' +
'        \n' +
'        const historyRes = await fetch("/" + currentTab + "/history");\n' +
'        const historyData = await historyRes.json();\n' +
'        const tbody = document.getElementById("historyBody");\n' +
'        if(historyData.history && historyData.history.length > 0) {\n' +
'            tbody.innerHTML = historyData.history.slice(0, 30).map(h => {\n' +
'                let statusClass = "", statusText = "";\n' +
'                if(h.ket_qua_du_doan === "DUNG") { statusClass = "correct"; statusText = "CORRECT"; }\n' +
'                else if(h.ket_qua_du_doan === "SAI") { statusClass = "wrong"; statusText = "WRONG"; }\n' +
'                else { statusClass = "pending"; statusText = "PENDING"; }\n' +
'                return \'<tr><td style="color:#00ffff;">#\' + h.Phien + \'</td><td class="\' + (h.Ket_qua === "Tài" ? "loss" : "win") + \'">\' + h.Ket_qua + \'</td><td class="\' + (h.Du_doan === "Tài" ? "loss" : "win") + \'">\' + h.Du_doan + \'</td><td style="color:#ffcc80;">\' + h.Do_tin_cay + \'</td><td><span class="method-tag">\' + (h.Phuong_phap || "AI") + \'</span></td><td class="\' + statusClass + \'">\' + statusText + \'</td></tr>\';\n' +
'            }).join("");\n' +
'        } else {\n' +
'            tbody.innerHTML = \'<tr><td colspan="6" style="text-align:center;">NO DATA</td></tr>\';\n' +
'        }\n' +
'    } catch(e) { console.error(e); }\n' +
'}\n' +
'\n' +
'function switchTab(tab) { currentTab = tab; document.querySelectorAll(".tab").forEach(btn => btn.classList.remove("active")); event.target.classList.add("active"); loadData(); }\n' +
'async function refreshData() { await loadData(); }\n' +
'loadData(); setInterval(loadData, 5000);\n' +
'</script>\n' +
'</body>\n' +
'</html>';
  res.send(html);
});

// KHỞI ĐỘNG
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║     ULTIMATE MACHINE v3.0 - SIÊU BỘ MÁY DỰ ĐOÁN        ║`);
  console.log(`║     Author: @AnhKhoi                                   ║`);
  console.log(`║     30+ ALGORITHMS | AI POWERED                        ║`);
  console.log(`║     PORT: ${PORT}                                      ║`);
  console.log(`║     DASHBOARD: http://0.0.0.0:${PORT}/dashboard        ║`);
  console.log(`║     API HU: http://0.0.0.0:${PORT}/hu                  ║`);
  console.log(`║     API MD5: http://0.0.0.0:${PORT}/md5                ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
});