const { useEffect, useMemo, useState } = React;

const motionPropsToOmit = new Set([
  "animate",
  "initial",
  "transition",
  "whileHover",
  "whileTap",
  "layout",
  "variants",
  "exit",
]);

const motion = new Proxy({}, {
  get: (_target, tag) => React.forwardRef(({ children, ...props }, ref) => {
    const cleanProps = { ...props, ref };
    motionPropsToOmit.forEach((prop) => delete cleanProps[prop]);
    return React.createElement(tag, cleanProps, children);
  }),
});

function Button({ children, className = "", variant = "default", type = "button", ...props }) {
  const variants = {
    default: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400",
    secondary: "bg-white/10 text-white hover:bg-white/20",
    outline: "border border-white/20 bg-white/5 text-white hover:bg-white/10",
  };
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <section className={`rounded-lg border ${className}`}>{children}</section>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const MIN_BOARD_SIZE = 4;
const MAX_BOARD_SIZE = 16;
const BOARD_SIZE_STEP = 2;
const BOARD_SIZE_PRESETS = [6, 8, 10, 12, 14, 16];

const MODE_HUMAN_AI = "human-ai";
const MODE_HUMAN_HUMAN = "human-human";
const MODE_AI_AI = "ai-ai";

const AI_RANDOMNESS_LEVELS = [
  { id: "low", label: "낮음", value: 8 },
  { id: "normal", label: "보통", value: 22 },
  { id: "high", label: "높음", value: 42 },
];

const directions = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function getBoardSize(board) {
  return board.length;
}

function clampBoardSize(size) {
  const roundedEven = Math.round(size / BOARD_SIZE_STEP) * BOARD_SIZE_STEP;
  return Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, roundedEven));
}

function createInitialBoard(size = 8) {
  const safeSize = clampBoardSize(size);
  const board = Array.from({ length: safeSize }, () => Array(safeSize).fill(EMPTY));
  const mid = safeSize / 2;
  board[mid - 1][mid - 1] = WHITE;
  board[mid - 1][mid] = BLACK;
  board[mid][mid - 1] = BLACK;
  board[mid][mid] = WHITE;
  return board;
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function opponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

function isInside(board, row, col) {
  const size = getBoardSize(board);
  return row >= 0 && row < size && col >= 0 && col < size;
}

function shouldAutomateTurn(mode, currentPlayer, humanPlayer) {
  if (mode === MODE_AI_AI) return true;
  if (mode === MODE_HUMAN_AI) return currentPlayer === opponent(humanPlayer);
  return false;
}

function getPositionWeight(size, row, col) {
  const last = size - 1;
  const isCorner = (row === 0 || row === last) && (col === 0 || col === last);
  const isNearCorner =
    (row <= 1 && col <= 1) ||
    (row <= 1 && col >= last - 1) ||
    (row >= last - 1 && col <= 1) ||
    (row >= last - 1 && col >= last - 1);
  const isEdge = row === 0 || col === 0 || row === last || col === last;
  const center = (size - 1) / 2;
  const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);

  if (isCorner) return 140;
  if (isNearCorner) return -35;
  if (isEdge) return 24;
  return Math.max(2, 18 - distanceFromCenter * 2);
}

function getFlips(board, row, col, player) {
  if (!isInside(board, row, col) || board[row][col] !== EMPTY) return [];

  const enemy = opponent(player);
  const flips = [];

  for (const [dr, dc] of directions) {
    let r = row + dr;
    let c = col + dc;
    const line = [];

    while (isInside(board, r, c) && board[r][c] === enemy) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }

    if (line.length > 0 && isInside(board, r, c) && board[r][c] === player) {
      flips.push(...line);
    }
  }

  return flips;
}

function getValidMoves(board, player) {
  const size = getBoardSize(board);
  const moves = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const flips = getFlips(board, r, c, player);
      if (flips.length > 0) moves.push({ row: r, col: c, flips });
    }
  }
  return moves;
}

function applyMove(board, row, col, player) {
  const flips = getFlips(board, row, col, player);
  if (flips.length === 0) return null;

  const nextBoard = cloneBoard(board);
  nextBoard[row][col] = player;
  for (const [r, c] of flips) nextBoard[r][c] = player;
  return nextBoard;
}

function countPieces(board) {
  let black = 0;
  let white = 0;
  let empty = 0;

  for (const row of board) {
    for (const cell of row) {
      if (cell === BLACK) black++;
      else if (cell === WHITE) white++;
      else empty++;
    }
  }

  return { black, white, empty };
}

function getWinner(board) {
  const score = countPieces(board);
  if (score.black > score.white) return BLACK;
  if (score.white > score.black) return WHITE;
  return EMPTY;
}

function isGameFinished(board) {
  const score = countPieces(board);
  return score.empty === 0 || (getValidMoves(board, BLACK).length === 0 && getValidMoves(board, WHITE).length === 0);
}

function evaluateBoard(board, aiPlayer) {
  const size = getBoardSize(board);
  const enemy = opponent(aiPlayer);
  const score = countPieces(board);
  const pieceScore = aiPlayer === BLACK ? score.black - score.white : score.white - score.black;
  const aiMoves = getValidMoves(board, aiPlayer).length;
  const enemyMoves = getValidMoves(board, enemy).length;
  let positionScore = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const weight = getPositionWeight(size, r, c);
      if (board[r][c] === aiPlayer) positionScore += weight;
      if (board[r][c] === enemy) positionScore -= weight;
    }
  }

  return pieceScore * 2 + positionScore + (aiMoves - enemyMoves) * 6;
}

function getMoveScore(board, move, aiPlayer, difficulty) {
  const size = getBoardSize(board);
  const nextBoard = applyMove(board, move.row, move.col, aiPlayer);
  if (!nextBoard) return -Infinity;

  let score = move.flips.length * 10 + getPositionWeight(size, move.row, move.col);

  if (difficulty === "normal" || difficulty === "hard") {
    const enemyResponses = getValidMoves(nextBoard, opponent(aiPlayer));
    const worstResponse = enemyResponses.length > 0
      ? Math.max(...enemyResponses.map((enemyMove) => enemyMove.flips.length * 10 + getPositionWeight(size, enemyMove.row, enemyMove.col)))
      : -20;
    score -= worstResponse * 0.65;
  }

  if (difficulty === "hard") score += evaluateBoard(nextBoard, aiPlayer);
  return score;
}

function getRandomnessValue(randomness) {
  return AI_RANDOMNESS_LEVELS.find((level) => level.id === randomness)?.value ?? 22;
}

function randomnessLabel(randomness) {
  return AI_RANDOMNESS_LEVELS.find((level) => level.id === randomness)?.label ?? "보통";
}

function chooseRandomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function chooseAiMove(board, aiPlayer, difficulty, randomness = "normal") {
  const moves = getValidMoves(board, aiPlayer);
  const size = getBoardSize(board);
  if (moves.length === 0) return null;

  const randomPower = getRandomnessValue(randomness);

  if (difficulty === "easy") {
    const scored = moves
      .map((move) => ({
        move,
        score: move.flips.length * 10 + getPositionWeight(size, move.row, move.col) + Math.random() * randomPower * 1.6,
      }))
      .sort((a, b) => b.score - a.score);

    const topCount = Math.max(1, Math.ceil(scored.length * 0.55));
    return chooseRandomItem(scored.slice(0, topCount)).move;
  }

  const scored = moves
    .map((move) => {
      const baseScore = getMoveScore(board, move, aiPlayer, difficulty);
      const noise = (Math.random() * 2 - 1) * randomPower;
      return { move, score: baseScore + noise, baseScore };
    })
    .sort((a, b) => b.score - a.score);

  const bestBaseScore = Math.max(...scored.map((item) => item.baseScore));
  const tolerance = difficulty === "hard" ? randomPower * 0.75 : randomPower * 1.25;
  const nearBest = scored.filter((item) => bestBaseScore - item.baseScore <= tolerance);

  return chooseRandomItem(nearBest.length > 0 ? nearBest : scored.slice(0, 1)).move;
}

function getUndoTargetIndex(history, mode, humanPlayer, currentPlayer) {
  if (history.length === 0) return -1;

  if (mode !== MODE_HUMAN_AI) {
    return history.length - 1;
  }

  const startIndex = currentPlayer === humanPlayer ? history.length - 2 : history.length - 1;
  for (let i = startIndex; i >= 0; i--) {
    if (history[i].currentPlayer === humanPlayer) return i;
  }
  return -1;
}

function pieceName(player) {
  return player === BLACK ? "흑" : "백";
}

function pieceLabel(player) {
  return player === BLACK ? "흑돌" : "백돌";
}

function difficultyLabel(difficulty) {
  if (difficulty === "easy") return "쉬움";
  if (difficulty === "hard") return "어려움";
  return "보통";
}

function boardSizeLabel(size) {
  if (size === 4) return "4×4 초소형판";
  if (size === 6) return "6×6 빠른판";
  if (size === 8) return "8×8 기본판";
  if (size === 10) return "10×10 큰판";
  if (size === 12) return "12×12 대형판";
  if (size === 14) return "14×14 확장판";
  if (size === 16) return "16×16 초대형판";
  return `${size}×${size} 사용자판`;
}

function modeLabel(mode) {
  if (mode === MODE_AI_AI) return "AI 관전모드";
  if (mode === MODE_HUMAN_HUMAN) return "2인 대전 모드";
  return "플레이어 vs AI";
}

function MiniIcon({ type, className = "", size = 18 }) {
  if (type === "restart") {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 12A7 7 0 1 0 8 6.7L4 10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "hint") {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    );
  }

  if (type === "ai") {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="7" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M9 7V4m6 3V4M8 18l-2 3m10-3l2 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="12.5" r="1.2" fill="currentColor" />
        <circle cx="14" cy="12.5" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (type === "board") {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M4 9h16M4 15h16M9 4v16M15 4v16" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function runLogicTests() {
  const initial = createInitialBoard(8);
  const initialScore = countPieces(initial);
  console.assert(initialScore.black === 2, "초기 흑돌은 2개여야 합니다.");
  console.assert(initialScore.white === 2, "초기 백돌은 2개여야 합니다.");
  console.assert(initialScore.empty === 60, "8×8 초기 빈 칸은 60개여야 합니다.");
  console.assert(getValidMoves(initial, BLACK).length === 4, "초기 흑돌의 가능한 수는 4개여야 합니다.");
  console.assert(getValidMoves(initial, WHITE).length === 4, "초기 백돌의 가능한 수는 4개여야 합니다.");

  const next = applyMove(initial, 2, 3, BLACK);
  console.assert(next !== null, "흑돌은 3행 4열에 둘 수 있어야 합니다.");
  if (next) {
    const nextScore = countPieces(next);
    console.assert(nextScore.black === 4, "첫 수 이후 흑돌은 4개여야 합니다.");
    console.assert(nextScore.white === 1, "첫 수 이후 백돌은 1개여야 합니다.");
  }

  console.assert(applyMove(initial, 0, 0, BLACK) === null, "초기 상태에서 1행 1열은 둘 수 없어야 합니다.");

  const aiMove = chooseAiMove(initial, WHITE, "hard");
  console.assert(aiMove !== null, "AI는 초기 상태에서 둘 수 있는 수를 찾아야 합니다.");
  if (aiMove) console.assert(getFlips(initial, aiMove.row, aiMove.col, WHITE).length > 0, "AI가 고른 수는 합법 수여야 합니다.");

  const cornerBoard = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  cornerBoard[0][1] = BLACK;
  cornerBoard[0][2] = BLACK;
  cornerBoard[0][3] = WHITE;
  console.assert(getFlips(cornerBoard, 0, 0, WHITE).length === 2, "모서리 방향 뒤집기 계산이 맞아야 합니다.");

  const blackWinBoard = Array.from({ length: 8 }, () => Array(8).fill(BLACK));
  blackWinBoard[0][0] = WHITE;
  console.assert(getWinner(blackWinBoard) === BLACK, "흑돌이 더 많으면 흑돌 승리여야 합니다.");

  const drawBoard = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => ((r + c) % 2 === 0 ? BLACK : WHITE)));
  console.assert(getWinner(drawBoard) === EMPTY, "흑백 개수가 같으면 무승부여야 합니다.");

  const twoPlayerHistory = [{ currentPlayer: BLACK }, { currentPlayer: WHITE }];
  console.assert(getUndoTargetIndex(twoPlayerHistory, MODE_HUMAN_HUMAN, BLACK, BLACK) === 1, "2인 대전에서는 직전 한 수만 되돌려야 합니다.");

  const aiRoundHistory = [{ currentPlayer: BLACK }, { currentPlayer: WHITE }];
  console.assert(getUndoTargetIndex(aiRoundHistory, MODE_HUMAN_AI, BLACK, BLACK) === 0, "AI 대전에서 내 차례라면 내 수와 AI 수를 함께 되돌려야 합니다.");

  const aiOpeningHistory = [{ currentPlayer: BLACK }];
  console.assert(getUndoTargetIndex(aiOpeningHistory, MODE_HUMAN_AI, WHITE, WHITE) === -1, "AI 선공 직후에는 되돌릴 내 수가 없으므로 되돌리지 않아야 합니다.");

  console.assert(shouldAutomateTurn(MODE_AI_AI, BLACK, WHITE) === true, "AI 관전모드에서는 흑돌 턴도 자동 진행되어야 합니다.");
  console.assert(shouldAutomateTurn(MODE_AI_AI, WHITE, BLACK) === true, "AI 관전모드에서는 백돌 턴도 자동 진행되어야 합니다.");
  console.assert(shouldAutomateTurn(MODE_HUMAN_AI, WHITE, BLACK) === true, "플레이어 대 AI에서는 AI 돌 차례만 자동 진행되어야 합니다.");
  console.assert(shouldAutomateTurn(MODE_HUMAN_AI, BLACK, BLACK) === false, "플레이어 대 AI에서는 사람 돌 차례가 자동 진행되면 안 됩니다.");
  console.assert(getRandomnessValue("low") < getRandomnessValue("high"), "AI 랜덤성 높음은 낮음보다 더 큰 값을 가져야 합니다.");
  console.assert(randomnessLabel("normal") === "보통", "AI 랜덤성 보통 라벨이 표시되어야 합니다.");

  for (const size of [MIN_BOARD_SIZE, ...BOARD_SIZE_PRESETS]) {
    const board = createInitialBoard(size);
    const score = countPieces(board);
    console.assert(board.length === size && board[0].length === size, `${size}×${size} 보드가 생성되어야 합니다.`);
    console.assert(score.black === 2 && score.white === 2, `${size}×${size} 초기 돌 배치가 맞아야 합니다.`);
    console.assert(score.empty === size * size - 4, `${size}×${size} 초기 빈 칸 수가 맞아야 합니다.`);
    console.assert(getValidMoves(board, BLACK).length === 4, `${size}×${size} 초기 흑돌 가능한 수는 4개여야 합니다.`);
    console.assert(getValidMoves(board, WHITE).length === 4, `${size}×${size} 초기 백돌 가능한 수는 4개여야 합니다.`);
  }
}

runLogicTests();

function ReversiGame() {
  const [boardSize, setBoardSize] = useState(8);
  const [board, setBoard] = useState(() => createInitialBoard(8));
  const [currentPlayer, setCurrentPlayer] = useState(BLACK);
  const [message, setMessage] = useState("흑돌부터 시작합니다.");
  const [showHints, setShowHints] = useState(true);
  const [history, setHistory] = useState([]);
  const [gameMode, setGameMode] = useState(MODE_HUMAN_AI);
  const [humanPlayer, setHumanPlayer] = useState(BLACK);
  const [aiDifficulty, setAiDifficulty] = useState("normal");
  const [aiRandomness, setAiRandomness] = useState("normal");
  const [aiThinking, setAiThinking] = useState(false);

  const aiPlayer = opponent(humanPlayer);
  const isAutomatedTurn = shouldAutomateTurn(gameMode, currentPlayer, humanPlayer);
  const validMoves = useMemo(() => getValidMoves(board, currentPlayer), [board, currentPlayer]);
  const validMoveMap = useMemo(() => {
    const map = new Map();
    for (const move of validMoves) map.set(`${move.row}-${move.col}`, move);
    return map;
  }, [validMoves]);

  const score = useMemo(() => countPieces(board), [board]);
  const isGameOver = useMemo(() => isGameFinished(board), [board]);

  const resultInfo = useMemo(() => {
    if (!isGameOver) return null;

    const winner = getWinner(board);
    const difference = Math.abs(score.black - score.white);
    const finalScore = `최종 점수  흑 ${score.black} : 백 ${score.white}`;

    if (winner === EMPTY) {
      return { title: "무승부", badge: "DRAW", subtitle: `${finalScore} · 같은 점수입니다.`, tone: "draw" };
    }

    if (gameMode === MODE_HUMAN_AI) {
      const playerWon = winner === humanPlayer;
      return {
        title: playerWon ? "승리!" : "패배",
        badge: playerWon ? "WIN" : "LOSE",
        subtitle: `${playerWon ? "AI를 이겼습니다." : "AI에게 졌습니다."} ${finalScore} · ${difference}개 차이`,
        tone: playerWon ? "win" : "lose",
      };
    }

    return {
      title: `${pieceLabel(winner)} 승리!`,
      badge: gameMode === MODE_AI_AI ? "AI BATTLE END" : "GAME SET",
      subtitle: `${finalScore} · ${difference}개 차이`,
      tone: winner === BLACK ? "black" : "white",
    };
  }, [board, isGameOver, score.black, score.white, gameMode, humanPlayer]);

  function switchTurn(nextBoard, nextPlayer) {
    const nextMoves = getValidMoves(nextBoard, nextPlayer);
    const currentMoves = getValidMoves(nextBoard, opponent(nextPlayer));

    if (nextMoves.length > 0) {
      setCurrentPlayer(nextPlayer);
      setMessage(`${pieceLabel(nextPlayer)} 차례입니다.`);
      return;
    }

    if (currentMoves.length > 0) {
      setCurrentPlayer(opponent(nextPlayer));
      setMessage(`${pieceLabel(nextPlayer)}은 둘 곳이 없어 턴을 넘깁니다.`);
      return;
    }

    setMessage("더 이상 둘 수 있는 곳이 없습니다. 게임 종료!");
  }

  function makeMove(row, col, actor = "human") {
    if (isGameOver) return false;
    if (actor === "human" && isAutomatedTurn) {
      setMessage(gameMode === MODE_AI_AI ? "AI 관전모드에서는 보드가 자동으로 진행됩니다." : "AI가 생각 중입니다. 잠시 후 당신 차례가 됩니다.");
      return false;
    }

    const move = validMoveMap.get(`${row}-${col}`);
    if (!move) {
      setMessage("그 위치에는 둘 수 없습니다. 초록빛 표시가 있는 칸을 선택하세요.");
      return false;
    }

    const nextBoard = cloneBoard(board);
    nextBoard[row][col] = currentPlayer;
    for (const [r, c] of move.flips) nextBoard[r][c] = currentPlayer;

    setHistory((prev) => [
      ...prev,
      {
        board: cloneBoard(board),
        currentPlayer,
        message,
        boardSize,
      },
    ]);

    setBoard(nextBoard);
    switchTurn(nextBoard, opponent(currentPlayer));
    return true;
  }

  useEffect(() => {
    if (!isAutomatedTurn || isGameOver || aiThinking) return;

    const activeAiPlayer = gameMode === MODE_AI_AI ? currentPlayer : aiPlayer;
    const move = chooseAiMove(board, activeAiPlayer, aiDifficulty, aiRandomness);

    if (!move) {
      const nextPlayer = opponent(currentPlayer);
      if (getValidMoves(board, nextPlayer).length > 0) {
        setCurrentPlayer(nextPlayer);
        setMessage(`${pieceLabel(currentPlayer)}은 둘 곳이 없어 턴을 넘깁니다.`);
      }
      return;
    }

    setAiThinking(true);
    setMessage(`AI ${pieceLabel(activeAiPlayer)}가 생각 중입니다. 난이도: ${difficultyLabel(aiDifficulty)} · 랜덤성: ${randomnessLabel(aiRandomness)}`);

    const timer = window.setTimeout(() => {
      makeMove(move.row, move.col, "ai");
      setAiThinking(false);
    }, gameMode === MODE_AI_AI ? 420 : 550);

    return () => {
      window.clearTimeout(timer);
    };
  }, [board, currentPlayer, gameMode, humanPlayer, aiDifficulty, aiRandomness, isGameOver]);

  function resetGame(nextMode = gameMode, nextHumanPlayer = humanPlayer, nextBoardSize = boardSize) {
    const safeSize = clampBoardSize(nextBoardSize);
    setBoardSize(safeSize);
    setBoard(createInitialBoard(safeSize));
    setCurrentPlayer(BLACK);
    setHistory([]);
    setAiThinking(false);

    if (nextMode === MODE_AI_AI) {
      setMessage(`새 ${boardSizeLabel(safeSize)}을 시작했습니다. AI끼리 결투를 시작합니다.`);
    } else if (nextMode === MODE_HUMAN_AI && nextHumanPlayer === WHITE) {
      setMessage(`새 ${boardSizeLabel(safeSize)}을 시작했습니다. AI 흑돌부터 시작합니다.`);
    } else {
      setMessage(`새 ${boardSizeLabel(safeSize)}을 시작했습니다. 흑돌부터 시작합니다.`);
    }
  }

  function changeMode(nextMode) {
    setGameMode(nextMode);
    resetGame(nextMode, humanPlayer, boardSize);
  }

  function changeHumanPlayer(player) {
    setHumanPlayer(player);
    resetGame(gameMode, player, boardSize);
  }

  function changeBoardSize(size) {
    const nextSize = clampBoardSize(size);
    resetGame(gameMode, humanPlayer, nextSize);
  }

  function increaseBoardSize() {
    changeBoardSize(boardSize + BOARD_SIZE_STEP);
  }

  function decreaseBoardSize() {
    changeBoardSize(boardSize - BOARD_SIZE_STEP);
  }

  function undoMove() {
    const targetIndex = getUndoTargetIndex(history, gameMode, humanPlayer, currentPlayer);

    if (targetIndex < 0) {
      setMessage(gameMode === MODE_HUMAN_AI ? "아직 되돌릴 내 수가 없습니다." : "되돌릴 수 있는 수가 없습니다.");
      setAiThinking(false);
      return;
    }

    const target = history[targetIndex];
    setBoard(cloneBoard(target.board));
    setBoardSize(target.boardSize || getBoardSize(target.board));
    setCurrentPlayer(target.currentPlayer);
    setMessage(gameMode === MODE_HUMAN_AI ? "내 수와 AI 수를 함께 되돌렸습니다. 당신 차례입니다." : gameMode === MODE_AI_AI ? "AI 관전 기록을 한 수 되돌렸습니다." : "이전 수로 되돌렸습니다.");
    setHistory((prev) => prev.slice(0, targetIndex));
    setAiThinking(false);
  }

  const boardMaxWidth = Math.min(940, 560 + boardSize * 28);
  const canDecreaseBoard = boardSize > MIN_BOARD_SIZE;
  const canIncreaseBoard = boardSize < MAX_BOARD_SIZE;
  const showHumanHints = showHints && !isGameOver && !isAutomatedTurn;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-950 to-zinc-950 p-4 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row">
        <Card className="border-white/10 bg-white/10 text-white shadow-2xl backdrop-blur lg:w-96">
          <CardContent className="space-y-5 p-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-sm text-emerald-100">
                <MiniIcon type="sparkle" size={16} /> Reversi Game
              </div>
              <h1 className="text-3xl font-black tracking-tight">리버시</h1>
              <p className="mt-2 text-sm leading-6 text-white/70">
                AI와 직접 결투하거나, AI끼리 싸우는 모습을 관전할 수 있습니다.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-white/60">현재 턴</p>
              <div className="mt-2 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full border-2 ${currentPlayer === BLACK ? "border-zinc-500 bg-zinc-950" : "border-white bg-white"}`} />
                <p className="text-xl font-bold">
                  {isGameOver ? "게임 종료" : gameMode === MODE_AI_AI ? `AI ${pieceName(currentPlayer)} 차례` : isAutomatedTurn ? "AI 차례" : `${pieceName(currentPlayer)} 차례`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <p className="text-sm text-white/60">흑돌</p>
                <p className="text-3xl font-black">{score.black}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                <p className="text-sm text-white/60">백돌</p>
                <p className="text-3xl font-black">{score.white}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-violet-300/20 bg-violet-300/10 p-4 text-sm leading-6 text-violet-50">
              <div className="mb-3 flex items-center gap-2 font-bold">
                <MiniIcon type="board" size={18} /> 판 크기 설정
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <Button onClick={decreaseBoardSize} disabled={aiThinking || !canDecreaseBoard} className="rounded-xl bg-white/10 text-white hover:bg-white/20 disabled:opacity-40">
                  판 작게 -2
                </Button>
                <Button onClick={increaseBoardSize} disabled={aiThinking || !canIncreaseBoard} className="rounded-xl bg-violet-300 font-black text-violet-950 hover:bg-violet-200 disabled:opacity-40">
                  판 크게 +2
                </Button>
              </div>
              <div className="mb-3 rounded-2xl bg-black/20 p-3 text-center">
                <p className="text-xs text-white/60">현재 판 크기</p>
                <p className="text-3xl font-black">{boardSize}×{boardSize}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {BOARD_SIZE_PRESETS.map((size) => (
                  <Button
                    key={size}
                    onClick={() => changeBoardSize(size)}
                    disabled={aiThinking}
                    className={`rounded-xl px-2 ${boardSize === size ? "bg-violet-300 text-violet-950 hover:bg-violet-200" : "bg-white/10 text-white hover:bg-white/20"}`}
                  >
                    {size}×{size}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-xs text-white/65">4×4부터 16×16까지 2칸씩 조절됩니다.</p>
            </div>

            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
              <div className="mb-3 flex items-center gap-2 font-bold">
                <MiniIcon type="ai" size={18} /> 대전 모드
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button onClick={() => changeMode(MODE_HUMAN_AI)} className={`rounded-xl px-2 ${gameMode === MODE_HUMAN_AI ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  AI 대전
                </Button>
                <Button onClick={() => changeMode(MODE_HUMAN_HUMAN)} className={`rounded-xl px-2 ${gameMode === MODE_HUMAN_HUMAN ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  2인 대전
                </Button>
                <Button onClick={() => changeMode(MODE_AI_AI)} className={`rounded-xl px-2 ${gameMode === MODE_AI_AI ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  AI 관전
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button onClick={() => changeHumanPlayer(BLACK)} disabled={gameMode !== MODE_HUMAN_AI} className={`rounded-xl ${humanPlayer === BLACK && gameMode === MODE_HUMAN_AI ? "bg-white text-slate-950 hover:bg-zinc-200" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  나는 흑돌
                </Button>
                <Button onClick={() => changeHumanPlayer(WHITE)} disabled={gameMode !== MODE_HUMAN_AI} className={`rounded-xl ${humanPlayer === WHITE && gameMode === MODE_HUMAN_AI ? "bg-white text-slate-950 hover:bg-zinc-200" : "bg-white/10 text-white hover:bg-white/20"}`}>
                  나는 백돌
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {["easy", "normal", "hard"].map((level) => (
                  <Button
                    key={level}
                    onClick={() => setAiDifficulty(level)}
                    disabled={gameMode === MODE_HUMAN_HUMAN}
                    className={`rounded-xl px-2 ${aiDifficulty === level && gameMode !== MODE_HUMAN_HUMAN ? "bg-emerald-400 text-emerald-950 hover:bg-emerald-300" : "bg-white/10 text-white hover:bg-white/20"}`}
                  >
                    {difficultyLabel(level)}
                  </Button>
                ))}
              </div>

              <div className="mt-3">
                <p className="mb-2 text-xs font-bold text-white/70">AI 랜덤성</p>
                <div className="grid grid-cols-3 gap-2">
                  {AI_RANDOMNESS_LEVELS.map((level) => (
                    <Button
                      key={level.id}
                      onClick={() => setAiRandomness(level.id)}
                      disabled={gameMode === MODE_HUMAN_HUMAN}
                      className={`rounded-xl px-2 ${aiRandomness === level.id && gameMode !== MODE_HUMAN_HUMAN ? "bg-amber-300 text-amber-950 hover:bg-amber-200" : "bg-white/10 text-white hover:bg-white/20"}`}
                    >
                      {level.label}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="mt-3 text-xs text-white/65">현재: {modeLabel(gameMode)} · {gameMode === MODE_HUMAN_HUMAN ? "AI 없음" : `난이도 ${difficultyLabel(aiDifficulty)} · 랜덤성 ${randomnessLabel(aiRandomness)}`}</p>
            </div>

            <div className={`rounded-2xl border p-4 text-sm leading-6 ${
              resultInfo?.tone === "win"
                ? "border-lime-300/40 bg-lime-300/15 text-lime-50"
                : resultInfo?.tone === "lose"
                  ? "border-rose-300/40 bg-rose-300/15 text-rose-50"
                  : resultInfo?.tone === "draw"
                    ? "border-amber-300/40 bg-amber-300/15 text-amber-50"
                    : "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
            }`}>
              {resultInfo ? (
                <div>
                  <p className="text-2xl font-black">{resultInfo.title}</p>
                  <p className="mt-1 text-sm opacity-90">{resultInfo.subtitle}</p>
                </div>
              ) : (
                <span>{message}</span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={() => resetGame()} className="rounded-2xl bg-emerald-500 py-6 text-base font-bold text-emerald-950 hover:bg-emerald-400">
                <MiniIcon type="restart" className="mr-2" size={18} /> 다시 시작
              </Button>
              <Button onClick={undoMove} variant="secondary" className="rounded-2xl py-6 text-base font-bold" disabled={history.length === 0 || aiThinking}>
                {gameMode === MODE_HUMAN_AI ? "내 턴으로 되돌리기" : gameMode === MODE_AI_AI ? "관전 한 수 되돌리기" : "한 수 되돌리기"}
              </Button>
              <Button onClick={() => setShowHints((v) => !v)} variant="outline" className="rounded-2xl border-white/20 bg-white/5 py-6 text-base font-bold text-white hover:bg-white/10 hover:text-white">
                <MiniIcon type="hint" className="mr-2" size={18} /> {showHints ? "둘 수 있는 칸 숨기기" : "둘 수 있는 칸 표시"}
              </Button>
            </div>

            <div className="rounded-2xl bg-black/20 p-4 text-xs leading-6 text-white/60">
              <p className="font-bold text-white/80">조작법</p>
              <p>초록 점이 표시된 칸을 클릭하면 돌을 놓습니다.</p>
              <p>AI 관전모드에서는 흑돌 AI와 백돌 AI가 자동으로 둡니다.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 border-white/10 bg-white/10 shadow-2xl backdrop-blur">
          <CardContent className="p-4 sm:p-6">
            <div
              className="relative mx-auto aspect-square rounded-[2rem] border border-emerald-200/20 bg-emerald-900/80 p-3 shadow-inner sm:p-5"
              style={{ maxWidth: `${boardMaxWidth}px` }}
            >
              {resultInfo && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`absolute inset-3 z-20 flex items-center justify-center rounded-[1.6rem] border-4 p-4 text-center backdrop-blur-sm sm:inset-5 ${
                    resultInfo.tone === "win"
                      ? "border-lime-300 bg-lime-950/80 text-lime-50"
                      : resultInfo.tone === "lose"
                        ? "border-rose-300 bg-rose-950/80 text-rose-50"
                        : resultInfo.tone === "draw"
                          ? "border-amber-300 bg-amber-950/80 text-amber-50"
                          : "border-white bg-slate-950/80 text-white"
                  }`}
                >
                  <div className="max-w-md rounded-[2rem] bg-black/25 p-6 shadow-2xl">
                    <p className="mx-auto mb-4 inline-flex rounded-full bg-white/15 px-4 py-1 text-sm font-black tracking-[0.25em]">
                      {resultInfo.badge}
                    </p>
                    <h2 className="text-5xl font-black tracking-tight sm:text-7xl">{resultInfo.title}</h2>
                    <p className="mt-4 text-base font-bold leading-7 sm:text-xl">{resultInfo.subtitle}</p>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-black/30 p-4">
                        <p className="text-sm opacity-70">흑돌</p>
                        <p className="text-4xl font-black">{score.black}</p>
                      </div>
                      <div className="rounded-2xl bg-white/15 p-4">
                        <p className="text-sm opacity-70">백돌</p>
                        <p className="text-4xl font-black">{score.white}</p>
                      </div>
                    </div>
                    <Button onClick={() => resetGame()} className="mt-6 rounded-2xl bg-white px-8 py-6 text-base font-black text-slate-950 hover:bg-zinc-200">
                      다시 시작하기
                    </Button>
                  </div>
                </motion.div>
              )}

              <div
                className="grid h-full w-full overflow-hidden rounded-3xl border-4 border-emerald-950 bg-emerald-800"
                style={{ gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))` }}
              >
                {board.map((row, r) =>
                  row.map((cell, c) => {
                    const move = validMoveMap.get(`${r}-${c}`);
                    const showMoveHint = showHumanHints && Boolean(move);

                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => makeMove(r, c, "human")}
                        disabled={isAutomatedTurn || aiThinking || isGameOver}
                        className="relative flex items-center justify-center border border-emerald-950/60 bg-emerald-700/80 transition hover:bg-emerald-600/90 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:hover:bg-emerald-700/80"
                        aria-label={`${r + 1}행 ${c + 1}열`}
                      >
                        {showMoveHint && (
                          <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="absolute h-[30%] w-[30%] max-h-5 max-w-5 rounded-full bg-lime-300/80 shadow-[0_0_18px_rgba(190,242,100,0.9)]"
                            title={`뒤집을 돌 ${move.flips.length}개`}
                          />
                        )}

                        {cell !== EMPTY && (
                          <motion.div
                            initial={{ rotateY: 180, scale: 0.75 }}
                            animate={{ rotateY: 0, scale: 1 }}
                            transition={{ duration: 0.25 }}
                            className={`h-[72%] w-[72%] rounded-full shadow-xl ${
                              cell === BLACK
                                ? "border border-zinc-600 bg-gradient-to-br from-zinc-900 to-black"
                                : "border border-zinc-200 bg-gradient-to-br from-white to-zinc-300"
                            }`}
                          >
                            <div className={`ml-[18%] mt-[14%] h-[22%] w-[22%] rounded-full ${cell === BLACK ? "bg-white/15" : "bg-white/70"}`} />
                          </motion.div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mx-auto mt-4 flex max-w-[940px] flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              <span>모드: {modeLabel(gameMode)}</span>
              <span>판 크기: {boardSize}×{boardSize}</span>
              <span>가능한 수: {validMoves.length}개</span>
              <span>빈 칸: {score.empty}개</span>
              <span>{gameMode === MODE_AI_AI ? `AI 흑 vs AI 백 · ${difficultyLabel(aiDifficulty)} · 랜덤 ${randomnessLabel(aiRandomness)}` : gameMode === MODE_HUMAN_AI ? `AI: ${pieceLabel(aiPlayer)} · ${difficultyLabel(aiDifficulty)} · 랜덤 ${randomnessLabel(aiRandomness)}` : "사람 vs 사람"}</span>
              {resultInfo ? <span className="font-black text-white">결과: {resultInfo.title}</span> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ReversiGame />);
