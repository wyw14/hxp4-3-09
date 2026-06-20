import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import type { LevelsData, LevelData } from './types';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3003;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');

function loadLevels(): LevelsData {
  try {
    const raw = fs.readFileSync(LEVELS_FILE, 'utf-8');
    return JSON.parse(raw) as LevelsData;
  } catch (err) {
    console.error('Failed to load levels:', err);
    return { levels: [] };
  }
}

function saveLevels(data: LevelsData): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save levels:', err);
    return false;
  }
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0.0001) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function isSimpleFrequencyRatio(f1: number, f2: number, maxDenom: number = 10): boolean {
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  if (minF < 0.0001) return false;

  const ratio = maxF / minF;

  for (let denom = 1; denom <= maxDenom; denom++) {
    const numer = ratio * denom;
    const rounded = Math.round(numer);
    if (Math.abs(numer - rounded) < 0.02 && rounded <= maxDenom && rounded > 0) {
      return true;
    }
  }

  return false;
}

app.get('/api/levels', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    total: data.levels.length,
    levels: data.levels.map((l: LevelData) => ({
      id: l.id,
      name: l.name,
      creatureName: l.creatureName
    }))
  });
});

app.get('/api/levels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  res.json({
    success: true,
    level
  });
});

function resolveSourceLevelId(id: number): number {
  if (id >= 0) return id;
  return Math.floor((-id - 1) / 1000);
}

app.get('/api/levels/:id/verify', (req, res) => {
  const rawId = parseInt(req.params.id);
  const id = resolveSourceLevelId(rawId);
  const edgeParam = req.query.edge as string;

  if (!edgeParam) {
    res.status(400).json({
      success: false,
      error: 'Missing edge parameter'
    });
    return;
  }

  const [from, to] = edgeParam.split('-');
  if (!from || !to) {
    res.status(400).json({
      success: false,
      error: 'Invalid edge format, expected from-to'
    });
    return;
  }

  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  const fromPoint = level.anchorPoints.find(p => p.id === from);
  const toPoint = level.anchorPoints.find(p => p.id === to);

  if (!fromPoint || !toPoint) {
    res.json({
      success: true,
      valid: false,
      reason: 'Unknown anchor point'
    });
    return;
  }

  const isDefinedEdge = level.edges.some(
    e => (e.from === from && e.to === to) || (e.from === to && e.to === from)
  );

  const f1 = fromPoint.frequency;
  const f2 = toPoint.frequency;
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  const isHarmonic = isSimpleFrequencyRatio(f1, f2);

  res.json({
    success: true,
    valid: isDefinedEdge && isHarmonic,
    isHarmonic,
    isDefinedEdge,
    frequencies: {
      [from]: f1,
      [to]: f2
    },
    ratio: isHarmonic ? [minF, maxF] : null
  });
});

app.get('/api/levels/:id/practice', (req, res) => {
  const id = parseInt(req.params.id);
  const edgeCount = parseInt(req.query.edges as string) || 3;
  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  const mainEdges = level.edges;
  if (mainEdges.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Level has no edges'
    });
    return;
  }

  const actualCount = Math.min(edgeCount, mainEdges.length);
  const maxStart = mainEdges.length - actualCount;
  const startIdx = Math.floor(Math.random() * (maxStart + 1));
  const selectedEdges = mainEdges.slice(startIdx, startIdx + actualCount);

  const usedPointIds = new Set<string>();
  selectedEdges.forEach(e => {
    usedPointIds.add(e.from);
    usedPointIds.add(e.to);
  });

  const mainPoints = level.anchorPoints.filter(p => usedPointIds.has(p.id));

  const mainPointIds = new Set(mainPoints.map(p => p.id));
  const nearAuxPoints = level.anchorPoints.filter(p => {
    if (mainPointIds.has(p.id)) return false;
    const isAux = p.id.startsWith('d') || p.id.startsWith('e') || p.id.startsWith('f');
    if (!isAux) return false;
    for (const mp of mainPoints) {
      const dx = mp.x - p.x;
      const dy = mp.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3) return true;
    }
    return false;
  }).slice(0, 4);

  const allPoints = [...mainPoints, ...nearAuxPoints];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  allPoints.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  const padding = 0.15;
  const rangeX = Math.max(maxX - minX, 0.2);
  const rangeY = Math.max(maxY - minY, 0.2);
  const scaleX = (1 - 2 * padding) / rangeX;
  const scaleY = (1 - 2 * padding) / rangeY;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = padding + (1 - 2 * padding - rangeX * scale) / 2 - minX * scale;
  const offsetY = padding + (1 - 2 * padding - rangeY * scale) / 2 - minY * scale;

  const normalizedPoints = allPoints.map(p => ({
    ...p,
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY
  }));

  const practiceId = -id * 1000 - startIdx - 1;
  const practiceName = `${level.name}·练习`;
  const practiceLevel: LevelData = {
    id: practiceId,
    name: practiceName,
    creatureName: `${level.creatureName}(练习)`,
    creatureDescription: `这是从「${level.name}」中抽取的短练习，共 ${actualCount} 条星脉，帮助新手熟悉谐波共振连接。`,
    anchorPoints: normalizedPoints,
    edges: [...selectedEdges],
    lightPollution: level.lightPollution,
    rotationSpeed: level.rotationSpeed
  };

  res.json({
    success: true,
    level: practiceLevel,
    sourceLevel: id,
    startEdgeIndex: startIdx,
    edgeCount: actualCount
  });
});

app.post('/api/levels', (req, res) => {
  const newLevel = req.body as LevelData;

  if (!newLevel.id || !newLevel.anchorPoints || !newLevel.edges) {
    res.status(400).json({
      success: false,
      error: 'Invalid level data'
    });
    return;
  }

  const data = loadLevels();
  const existing = data.levels.findIndex(l => l.id === newLevel.id);

  if (existing >= 0) {
    data.levels[existing] = newLevel;
  } else {
    data.levels.push(newLevel);
  }

  if (saveLevels(data)) {
    res.json({
      success: true,
      level: newLevel
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save level'
    });
  }
});

app.get('/api/health', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    status: 'running',
    port: PORT,
    levelsLoaded: data.levels.length
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ 星座游戏服务器启动成功`);
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`🎮 关卡数量: ${loadLevels().levels.length}\n`);
});
