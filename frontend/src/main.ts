import { Game } from './game';
import type { LevelData } from './types';
import { healthCheck, getPracticeLevel } from './api';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const game = new Game(canvas);

const levelNumEl = document.getElementById('level-num')!;
const creatureNameEl = document.getElementById('creature-name')!;
const connectedCountEl = document.getElementById('connected-count')!;
const totalCountEl = document.getElementById('total-count')!;
const progressFillEl = document.getElementById('progress-fill')!;
const hintTitleEl = document.getElementById('hint-title')!;
const hintTextEl = document.getElementById('hint-text')!;
const completeModal = document.getElementById('complete-modal')!;
const modalTitleEl = document.getElementById('modal-title')!;
const modalDescEl = document.getElementById('modal-desc')!;

const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
const btnNext = document.getElementById('btn-next') as HTMLButtonElement;
const btnPractice = document.getElementById('btn-practice') as HTMLButtonElement;
const btnExitPractice = document.getElementById('btn-exit-practice') as HTMLButtonElement;

const MAX_LEVELS = 3;

let isPracticeMode = false;
let lastFormalLevelId = 1;

function isPracticeLevelId(id: number): boolean {
  return id < 0;
}

function resolveSourceLevelId(currentId: number): number {
  if (currentId >= 0) return currentId;
  const raw = -currentId;
  const edgeCount = raw % 1000;
  if (edgeCount === 0) {
    return Math.floor(raw / 1000000);
  }
  return Math.floor(raw / 1000000);
}

function enterPracticeMode(): void {
  isPracticeMode = true;
  btnPractice.style.display = 'none';
  btnExitPractice.style.display = 'inline-block';
}

function exitPracticeMode(): void {
  isPracticeMode = false;
  btnPractice.style.display = 'inline-block';
  btnExitPractice.style.display = 'none';
}

game.setCallbacks({
  onLevelChange: (level: LevelData) => {
    const isPractice = isPracticeLevelId(level.id);
    const displayId = isPractice ? resolveSourceLevelId(level.id) : level.id;
    levelNumEl.textContent = String(displayId);
    creatureNameEl.textContent = level.creatureName;
    totalCountEl.textContent = String(level.edges.length);
    connectedCountEl.textContent = '0';
    progressFillEl.style.width = '0%';
    completeModal.classList.remove('show');

    if (isPractice) {
      enterPracticeMode();
      hintTitleEl.textContent = `练习模式 · ${level.name}`;
      hintTextEl.textContent = '这是从正式关卡中抽取的连通星脉短练习，帮助你熟悉谐波共振连接。完成后可返回正式关卡。';
    } else {
      exitPracticeMode();
      lastFormalLevelId = level.id;
      hintTitleEl.textContent = `关卡 ${level.id}: ${level.name}`;
      hintTextEl.textContent = '寻找闪烁频率成倍数关系的恒星，从一颗星拖动到另一颗星连接它们';
    }
  },
  onProgressChange: (current: number, total: number) => {
    connectedCountEl.textContent = String(current);
    const pct = total > 0 ? (current / total) * 100 : 0;
    progressFillEl.style.width = `${pct}%`;

    if (current < total) {
      if (current === 0) {
        hintTitleEl.textContent = isPracticeMode ? '练习开始' : '观察星空';
        hintTextEl.textContent = isPracticeMode
          ? '认真观察星星的闪烁节奏，练习找到频率成倍数关系的恒星'
          : '仔细观察星星的闪烁节奏，找到频率相同或成倍数的恒星';
      } else if (current < total * 0.3) {
        hintTitleEl.textContent = isPracticeMode ? '练习初见成效' : '初见端倪';
        hintTextEl.textContent = '做得好！继续寻找，你会发现恒星间的谐波共振关系';
      } else if (current < total * 0.6) {
        hintTitleEl.textContent = isPracticeMode ? '练习进度过半' : '星脉初现';
        hintTextEl.textContent = '神话生物的轮廓正在浮现，耐心连接剩余的星脉';
      } else if (current < total) {
        hintTitleEl.textContent = isPracticeMode ? '练习即将完成' : '即将完成';
        hintTextEl.textContent = '只剩最后几颗星了！神话生物即将显现';
      }
    }
  },
  onComplete: (desc: string) => {
    hintTitleEl.textContent = isPracticeMode ? '✨ 练习完成 ✨' : '✨ 星座完成 ✨';
    hintTextEl.textContent = isPracticeMode
      ? '练习完成！你可以返回正式关卡继续挑战，或再做一次练习'
      : '星界神话生物已显现！仔细欣赏它的光辉吧';

    modalTitleEl.textContent = `✨ ${creatureNameEl.textContent} 降临 ✨`;
    modalDescEl.textContent = desc;
    completeModal.classList.add('show');

    if (isPracticeMode) {
      btnNext.textContent = '再来一次练习';
    } else if (game.getCurrentLevel() >= MAX_LEVELS) {
      btnNext.textContent = '重新开始';
    } else {
      btnNext.textContent = '下一关';
    }
  }
});

btnUndo.addEventListener('click', () => {
  game.undoLastConnection();
});

btnReset.addEventListener('click', () => {
  if (confirm('确定要重置本关吗？所有连线将被清除。')) {
    game.resetLevel();
  }
});

btnHint.addEventListener('click', () => {
  const showing = game.toggleFrequencies();
  btnHint.textContent = showing ? '隐藏频率' : '显示频率';
});

btnNext.addEventListener('click', async () => {
  const current = game.getCurrentLevel();

  if (isPracticeMode) {
    completeModal.classList.remove('show');
    btnHint.textContent = '显示频率';
    const practice = await getPracticeLevel(lastFormalLevelId, 3);
    if (practice) {
      game.loadLevelDirectly(practice);
    }
    return;
  }

  const nextLevel = current >= MAX_LEVELS ? 1 : current + 1;
  completeModal.classList.remove('show');
  btnHint.textContent = '显示频率';
  await game.loadLevel(nextLevel);
});

btnPractice.addEventListener('click', async () => {
  const current = game.getCurrentLevel();
  if (!isPracticeLevelId(current)) {
    lastFormalLevelId = current;
  }
  btnHint.textContent = '显示频率';
  completeModal.classList.remove('show');
  const practice = await getPracticeLevel(lastFormalLevelId, 3);
  if (practice) {
    game.loadLevelDirectly(practice);
  } else {
    alert('生成短练习失败，请稍后再试');
  }
});

btnExitPractice.addEventListener('click', async () => {
  btnHint.textContent = '显示频率';
  completeModal.classList.remove('show');
  await game.loadLevel(lastFormalLevelId);
});

async function init(): Promise<void> {
  hintTitleEl.textContent = '加载中...';
  hintTextEl.textContent = '正在连接星界数据库...';

  try {
    const backendOk = await healthCheck();
    if (!backendOk) {
      console.warn('后端未启动，尝试使用嵌入数据...');
    }
  } catch {
    console.warn('后端健康检查失败');
  }

  const loaded = await game.loadLevel(1);
  if (!loaded) {
    hintTitleEl.textContent = '⚠️ 加载失败';
    hintTextEl.textContent = '无法加载关卡数据，请确保后端服务器已启动 (npm run dev:backend)';
    return;
  }

  game.start();
}

init().catch(err => {
  console.error('初始化失败:', err);
  hintTitleEl.textContent = '错误';
  hintTextEl.textContent = String(err);
});
