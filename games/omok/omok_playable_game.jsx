const { useEffect, useMemo, useRef, useState } = React;

const SIZE = 15;
const EMPTY = null;
const BLACK = "black";
const WHITE = "white";
const DRAW = "draw";

const MODE_AI = "ai";
const MODE_TWO = "two";
const MODE_AI_VS_AI = "aivsai";

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const OPEN_THREE_PATTERNS = ["_SSS_", "_SS_S_", "_S_SS_"];

function createBoard() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => EMPTY));
}

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function getOpponent(stone) {
  return stone === BLACK ? WHITE : BLACK;
}

function getStoneName(stone, mode = MODE_TWO) {
  if (stone === BLACK) return mode === MODE_AI_VS_AI ? "흑 AI" : "흑돌";
  if (stone === WHITE) return mode === MODE_AI ? "AI" : mode === MODE_AI_VS_AI ? "백 AI" : "백돌";
  return "";
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function boardIsFull(board) {
  return board.every((row) => row.every((cell) => cell !== EMPTY));
}

function countLine(board, row, col, dr, dc, stone) {
  let count = 0;
  let r = row + dr;
  let c = col + dc;

  while (inBounds(r, c) && board[r][c] === stone) {
    count += 1;
    r += dr;
    c += dc;
  }

  return count;
}

function getWinningLine(board, row, col, stone) {
  for (const [dr, dc] of DIRECTIONS) {
    const forward = countLine(board, row, col, dr, dc, stone);
    const backward = countLine(board, row, col, -dr, -dc, stone);
    const total = 1 + forward + backward;

    if (total >= 5) {
      const cells = [];
      const startRow = row - backward * dr;
      const startCol = col - backward * dc;

      for (let i = 0; i < total; i += 1) {
        cells.push(`${startRow + i * dr}-${startCol + i * dc}`);
      }

      return cells;
    }
  }

  return [];
}

function readDirectionalLine(board, row, col, dr, dc, stone) {
  const chars = [];

  for (let offset = -5; offset <= 5; offset += 1) {
    const r = row + offset * dr;
    const c = col + offset * dc;

    if (!inBounds(r, c)) chars.push("B");
    else if (board[r][c] === stone) chars.push("S");
    else if (board[r][c] === EMPTY) chars.push("_");
    else chars.push("O");
  }

  return chars.join("");
}

function patternMatches(line, pattern, start) {
  for (let i = 0; i < pattern.length; i += 1) {
    if (line[start + i] !== pattern[i]) return false;
  }

  return true;
}

function createsOpenThreeInDirection(board, row, col, dr, dc, stone) {
  const line = readDirectionalLine(board, row, col, dr, dc, stone);
  const centerIndex = 5;

  for (const pattern of OPEN_THREE_PATTERNS) {
    for (let start = 0; start <= line.length - pattern.length; start += 1) {
      const end = start + pattern.length - 1;
      if (centerIndex < start || centerIndex > end) continue;
      if (patternMatches(line, pattern, start)) return true;
    }
  }

  return false;
}

function countOpenThreeDirectionsAfterMove(board, row, col, stone) {
  if (!inBounds(row, col) || board[row][col] !== EMPTY) return 0;

  const testBoard = cloneBoard(board);
  testBoard[row][col] = stone;

  let openThreeDirections = 0;

  for (const [dr, dc] of DIRECTIONS) {
    if (createsOpenThreeInDirection(testBoard, row, col, dr, dc, stone)) {
      openThreeDirections += 1;
    }
  }

  return openThreeDirections;
}

function isDoubleThreeForbidden(board, row, col, stone) {
  if (!inBounds(row, col) || board[row][col] !== EMPTY) return false;

  const testBoard = cloneBoard(board);
  testBoard[row][col] = stone;

  // 5목을 완성하는 수는 승리 수로 처리하고 33 금수로 막지 않습니다.
  if (getWinningLine(testBoard, row, col, stone).length >= 5) return false;

  return countOpenThreeDirectionsAfterMove(board, row, col, stone) >= 2;
}

function hasNeighbor(board, row, col) {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (inBounds(nr, nc) && board[nr][nc] !== EMPTY) return true;
    }
  }

  return false;
}

function openEnds(board, row, col, dr, dc, stone) {
  const leftCount = countLine(board, row, col, -dr, -dc, stone);
  const rightCount = countLine(board, row, col, dr, dc, stone);

  const leftRow = row - (leftCount + 1) * dr;
  const leftCol = col - (leftCount + 1) * dc;
  const rightRow = row + (rightCount + 1) * dr;
  const rightCol = col + (rightCount + 1) * dc;

  let open = 0;
  if (inBounds(leftRow, leftCol) && board[leftRow][leftCol] === EMPTY) open += 1;
  if (inBounds(rightRow, rightCol) && board[rightRow][rightCol] === EMPTY) open += 1;
  return open;
}

function lineScore(total, open) {
  if (total >= 5) return 1_000_000;
  if (total === 4 && open >= 1) return open === 2 ? 120_000 : 80_000;
  if (total === 3 && open === 2) return 18_000;
  if (total === 3 && open === 1) return 5_000;
  if (total === 2 && open === 2) return 1_200;
  if (total === 2 && open === 1) return 350;
  return total * 20;
}

function evaluateMove(board, row, col, stone) {
  if (isDoubleThreeForbidden(board, row, col, stone)) return -1;

  const opponent = getOpponent(stone);
  let score = 0;

  for (const [dr, dc] of DIRECTIONS) {
    const ownTotal = 1 + countLine(board, row, col, dr, dc, stone) + countLine(board, row, col, -dr, -dc, stone);
    const oppTotal = 1 + countLine(board, row, col, dr, dc, opponent) + countLine(board, row, col, -dr, -dc, opponent);

    const ownOpen = openEnds(board, row, col, dr, dc, stone);
    const oppOpen = openEnds(board, row, col, dr, dc, opponent);

    score += lineScore(ownTotal, ownOpen);
    score += Math.floor(lineScore(oppTotal, oppOpen) * 0.92);
  }

  const center = Math.floor(SIZE / 2);
  const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);
  score += Math.max(0, 30 - distanceFromCenter * 2);

  return score;
}

function findAnyLegalMove(board, stone) {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === EMPTY && !isDoubleThreeForbidden(board, row, col, stone)) {
        return { row, col };
      }
    }
  }

  return null;
}

function findBestAIMove(board, stone = WHITE) {
  const hasAnyStone = board.some((row) => row.some((cell) => cell !== EMPTY));

  if (!hasAnyStone) {
    return { row: Math.floor(SIZE / 2), col: Math.floor(SIZE / 2) };
  }

  const candidates = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] !== EMPTY) continue;
      if (isDoubleThreeForbidden(board, row, col, stone)) continue;
      if (!hasNeighbor(board, row, col)) continue;
      candidates.push({ row, col, score: evaluateMove(board, row, col, stone) });
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const center = Math.floor(SIZE / 2);
    const ad = Math.abs(a.row - center) + Math.abs(a.col - center);
    const bd = Math.abs(b.row - center) + Math.abs(b.col - center);
    return ad - bd;
  });

  return candidates[0] ?? findAnyLegalMove(board, stone);
}

function buildBoardFromMoves(moves) {
  const board = createBoard();
  for (const { row, col, stone } of moves) {
    board[row][col] = stone;
  }
  return board;
}

function runLogicTests() {
  const board1 = createBoard();
  for (let col = 3; col <= 7; col += 1) board1[7][col] = BLACK;
  console.assert(getWinningLine(board1, 7, 5, BLACK).length >= 5, "가로 5목 판정 실패");

  const board2 = createBoard();
  for (let row = 1; row <= 5; row += 1) board2[row][2] = WHITE;
  console.assert(getWinningLine(board2, 3, 2, WHITE).length >= 5, "세로 5목 판정 실패");

  const board3 = createBoard();
  for (let i = 0; i < 5; i += 1) board3[4 + i][4 + i] = BLACK;
  console.assert(getWinningLine(board3, 6, 6, BLACK).length >= 5, "대각선 5목 판정 실패");

  const board4 = createBoard();
  board4[7][7] = BLACK;
  board4[7][8] = BLACK;
  board4[7][9] = BLACK;
  board4[7][10] = BLACK;
  const aiDefenseMove = findBestAIMove(board4, WHITE);
  console.assert(aiDefenseMove.row === 7 && (aiDefenseMove.col === 6 || aiDefenseMove.col === 11), "AI 방어 수 선택 실패");

  const board5 = createBoard();
  board5[5][5] = WHITE;
  board5[5][6] = WHITE;
  board5[5][7] = WHITE;
  board5[5][8] = WHITE;
  const aiAttackMove = findBestAIMove(board5, WHITE);
  console.assert(aiAttackMove.row === 5 && (aiAttackMove.col === 4 || aiAttackMove.col === 9), "AI 승리 수 선택 실패");

  const board6 = createBoard();
  board6[7][6] = BLACK;
  board6[7][8] = BLACK;
  board6[6][7] = BLACK;
  board6[8][7] = BLACK;
  console.assert(isDoubleThreeForbidden(board6, 7, 7, BLACK), "33 금수 판정 실패");

  const board7 = createBoard();
  board7[7][6] = WHITE;
  board7[7][8] = WHITE;
  board7[6][7] = WHITE;
  board7[8][7] = WHITE;
  const legalAiMove = findBestAIMove(board7, WHITE);
  console.assert(!(legalAiMove.row === 7 && legalAiMove.col === 7), "AI 33 금수 회피 실패");

  const board8 = createBoard();
  board8[7][3] = BLACK;
  board8[7][4] = BLACK;
  board8[7][5] = BLACK;
  board8[7][6] = BLACK;
  console.assert(!isDoubleThreeForbidden(board8, 7, 7, BLACK), "승리 수가 33으로 잘못 차단됨");

  const firstMove = findBestAIMove(createBoard(), BLACK);
  console.assert(firstMove.row === 7 && firstMove.col === 7, "AI 첫 수 중앙 선택 실패");

  const rebuilt = buildBoardFromMoves([
    { row: 0, col: 0, stone: BLACK },
    { row: 1, col: 1, stone: WHITE },
  ]);
  console.assert(rebuilt[0][0] === BLACK && rebuilt[1][1] === WHITE, "히스토리 기반 보드 재생성 실패");
}

function Button({ children, onClick, active = false, disabled = false, title = "" }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-12 rounded-2xl px-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "bg-neutral-950 text-white shadow-lg shadow-black/20"
          : "bg-white/80 text-neutral-950 ring-1 ring-amber-900/15 hover:bg-amber-100"
      }`}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <section className={`rounded-3xl border border-amber-900/15 bg-white/75 shadow-xl backdrop-blur ${className}`}>{children}</section>;
}

function Stone({ color, isLast }) {
  return (
    <div
      className={`relative h-[82%] w-[82%] animate-[pop_140ms_ease-out] rounded-full shadow-md ${
        color === BLACK
          ? "bg-neutral-950 shadow-black/35"
          : "bg-gradient-to-br from-white to-neutral-200 shadow-black/20 ring-1 ring-neutral-300"
      }`}
    >
      <div
        className={`absolute left-[22%] top-[18%] h-[18%] w-[18%] rounded-full ${
          color === BLACK ? "bg-white/20" : "bg-white/90"
        }`}
      />
      {isLast && <div className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}
    </div>
  );
}

function MoveLog({ history, mode }) {
  const recent = history.slice(-8).reverse();

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-black text-neutral-950">최근 착수</h3>
      {recent.length === 0 ? (
        <p className="rounded-2xl bg-amber-50/80 p-3 text-sm text-neutral-600">아직 둔 수가 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map((move, index) => {
            const moveNumber = history.length - index;
            return (
              <div key={`${move.row}-${move.col}-${moveNumber}`} className="flex items-center justify-between rounded-2xl bg-amber-50/80 px-3 py-2 text-sm">
                <span className="font-bold">#{moveNumber} {getStoneName(move.stone, mode)}</span>
                <span className="text-neutral-600">{move.row + 1}행 {move.col + 1}열</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OmokGame() {
  const [board, setBoard] = useState(createBoard);
  const [turn, setTurn] = useState(BLACK);
  const [history, setHistory] = useState([]);
  const [winner, setWinner] = useState(null);
  const [winningCells, setWinningCells] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [mode, setMode] = useState(MODE_AI);
  const [message, setMessage] = useState("흑돌 차례입니다.");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [aiDelay, setAiDelay] = useState(420);
  const aiTimerRef = useRef(null);

  useEffect(() => {
    runLogicTests();
  }, []);

  function clearAiTimer() {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    setIsAiThinking(false);
  }

  function placeStone(row, col, stone, currentBoard, currentHistory, currentMode = mode) {
    if (!inBounds(row, col) || currentBoard[row][col] !== EMPTY) return null;
    if (isDoubleThreeForbidden(currentBoard, row, col, stone)) {
      return {
        board: currentBoard,
        history: currentHistory,
        lastMove,
        winner: null,
        winningCells,
        forbidden: true,
        message: "33 금수입니다. 열린 3이 두 방향 이상 만들어지는 자리는 둘 수 없습니다.",
      };
    }

    const nextBoard = cloneBoard(currentBoard);
    nextBoard[row][col] = stone;
    const nextHistory = [...currentHistory, { row, col, stone }];
    const line = getWinningLine(nextBoard, row, col, stone);
    const stoneName = getStoneName(stone, currentMode);

    if (line.length > 0) {
      return {
        board: nextBoard,
        history: nextHistory,
        lastMove: { row, col },
        winner: stone,
        winningCells: line,
        message: `${stoneName}이 5목을 완성했습니다!`,
      };
    }

    if (boardIsFull(nextBoard)) {
      return {
        board: nextBoard,
        history: nextHistory,
        lastMove: { row, col },
        winner: DRAW,
        winningCells: [],
        message: "더 둘 곳이 없어 무승부입니다.",
      };
    }

    return {
      board: nextBoard,
      history: nextHistory,
      lastMove: { row, col },
      winner: null,
      winningCells: [],
      message: `${stoneName}: ${row + 1}행 ${col + 1}열에 착수했습니다.`,
    };
  }

  function applyGameState(nextState) {
    if (nextState.forbidden) {
      setMessage(nextState.message);
      return;
    }

    setBoard(nextState.board);
    setHistory(nextState.history);
    setLastMove(nextState.lastMove);
    setWinner(nextState.winner);
    setWinningCells(nextState.winningCells);
    if (nextState.message) setMessage(nextState.message);
  }

  useEffect(() => {
    clearAiTimer();

    const shouldAIMove =
      !winner &&
      ((mode === MODE_AI && turn === WHITE) ||
        (mode === MODE_AI_VS_AI && isAutoRunning));

    if (!shouldAIMove) return undefined;

    setIsAiThinking(true);
    const currentTurn = turn;
    const currentBoard = board;
    const currentHistory = history;
    const currentMode = mode;

    aiTimerRef.current = window.setTimeout(() => {
      const aiMove = findBestAIMove(currentBoard, currentTurn);

      if (!aiMove) {
        setWinner(DRAW);
        setMessage("둘 수 있는 합법 수가 없어 무승부입니다.");
        setIsAiThinking(false);
        aiTimerRef.current = null;
        return;
      }

      const aiState = placeStone(aiMove.row, aiMove.col, currentTurn, currentBoard, currentHistory, currentMode);

      if (aiState) {
        applyGameState(aiState);
        if (!aiState.winner && !aiState.forbidden) {
          const nextTurn = getOpponent(currentTurn);
          setTurn(nextTurn);
          if (currentMode === MODE_AI) {
            setMessage("흑돌 차례입니다.");
          }
        }
      }

      setIsAiThinking(false);
      aiTimerRef.current = null;
    }, aiDelay);

    return () => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
    };
  }, [board, history, turn, winner, mode, isAutoRunning, aiDelay]);

  const forbiddenCells = useMemo(() => {
    const cells = new Set();
    const canHumanPlace =
      !winner &&
      !isAiThinking &&
      mode !== MODE_AI_VS_AI &&
      !(mode === MODE_AI && turn !== BLACK);

    if (!canHumanPlace) return cells;

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (board[row][col] === EMPTY && isDoubleThreeForbidden(board, row, col, turn)) {
          cells.add(`${row}-${col}`);
        }
      }
    }

    return cells;
  }, [board, turn, mode, winner, isAiThinking]);

  const statusText = useMemo(() => {
    if (winner === DRAW) return "무승부";
    if (winner === BLACK) return mode === MODE_AI_VS_AI ? "흑 AI 승리!" : "흑돌 승리!";
    if (winner === WHITE) return mode === MODE_AI ? "AI 승리!" : mode === MODE_AI_VS_AI ? "백 AI 승리!" : "백돌 승리!";
    if (mode === MODE_AI) return turn === BLACK ? "내 차례: 흑돌" : "AI가 생각 중";
    if (mode === MODE_AI_VS_AI) {
      if (!isAutoRunning) return "AI VS AI 일시정지";
      return turn === BLACK ? "흑 AI 생각 중" : "백 AI 생각 중";
    }
    return turn === BLACK ? "흑돌 차례" : "백돌 차례";
  }, [winner, turn, mode, isAutoRunning]);

  function resetGame(nextMode = mode) {
    clearAiTimer();
    setBoard(createBoard());
    setTurn(BLACK);
    setHistory([]);
    setWinner(null);
    setWinningCells([]);
    setLastMove(null);
    setMode(nextMode);
    setIsAutoRunning(nextMode === MODE_AI_VS_AI);
    setMessage(nextMode === MODE_AI_VS_AI ? "AI VS AI 결투를 시작합니다." : "흑돌 차례입니다.");
  }

  function handleCellClick(row, col) {
    if (winner || isAiThinking || board[row][col] !== EMPTY) return;
    if (mode === MODE_AI && turn !== BLACK) return;
    if (mode === MODE_AI_VS_AI) return;

    if (isDoubleThreeForbidden(board, row, col, turn)) {
      setMessage("33 금수입니다. 열린 3이 두 방향 이상 만들어지는 자리는 둘 수 없습니다.");
      return;
    }

    const playerState = placeStone(row, col, turn, board, history, mode);
    if (!playerState) return;
    applyGameState(playerState);

    if (playerState.winner) return;

    const nextTurn = getOpponent(turn);
    setTurn(nextTurn);

    if (mode === MODE_TWO) {
      setMessage(nextTurn === BLACK ? "흑돌 차례입니다." : "백돌 차례입니다.");
    }
  }

  function undoMove() {
    if (winner) {
      setMessage("게임이 끝난 뒤에는 다시시작을 눌러주세요.");
      return;
    }

    if (history.length === 0) {
      setMessage("되돌릴 수가 없습니다.");
      return;
    }

    clearAiTimer();
    if (mode === MODE_AI_VS_AI) setIsAutoRunning(false);

    const removeCount = mode === MODE_TWO ? 1 : Math.min(2, history.length);
    const nextHistory = history.slice(0, history.length - removeCount);
    const nextBoard = buildBoardFromMoves(nextHistory);
    const nextTurn = nextHistory.length % 2 === 0 ? BLACK : WHITE;

    setBoard(nextBoard);
    setHistory(nextHistory);
    setWinner(null);
    setWinningCells([]);
    setLastMove(nextHistory[nextHistory.length - 1] ?? null);
    setTurn(mode === MODE_AI ? BLACK : nextTurn);
    setMessage(mode === MODE_AI_VS_AI ? "두 수를 되돌리고 관전을 일시정지했습니다." : mode === MODE_AI ? "한 턴을 되돌렸습니다." : "한 수를 되돌렸습니다.");
  }

  function switchMode(nextMode) {
    resetGame(nextMode);
  }

  function toggleAutoBattle() {
    if (mode !== MODE_AI_VS_AI || winner) return;
    clearAiTimer();
    setIsAutoRunning((prev) => {
      const next = !prev;
      setMessage(next ? "AI VS AI 결투를 다시 시작합니다." : "AI VS AI 결투를 일시정지했습니다.");
      return next;
    });
  }

  const isBoardLocked = Boolean(winner) || isAiThinking || mode === MODE_AI_VS_AI;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff8e7_0,_#f4dfb5_38%,_#d49a50_100%)] p-4 text-neutral-950 sm:p-6">
      <style>{`@keyframes pop { from { transform: scale(.35); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden bg-amber-50/80 shadow-2xl">
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">오목</h1>
                <p className="mt-1 text-sm text-neutral-700">가로, 세로, 대각선으로 돌 5개를 먼저 연결하면 승리합니다.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-bold shadow-sm ring-1 ring-amber-900/10">
                <span aria-hidden="true">🏆</span>
                {statusText}
              </div>
            </div>

            <div className="mx-auto aspect-square w-full max-w-[760px] rounded-2xl bg-[#dba85f] p-3 shadow-inner ring-4 ring-amber-950/20 sm:p-5">
              <div
                className="grid h-full w-full rounded-xl border-2 border-amber-950/70 bg-[#d6a15a]"
                style={{
                  gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${SIZE}, minmax(0, 1fr))`,
                }}
              >
                {board.map((rowCells, row) =>
                  rowCells.map((cell, col) => {
                    const key = `${row}-${col}`;
                    const isWinning = winningCells.includes(key);
                    const isLast = lastMove?.row === row && lastMove?.col === col;
                    const isForbidden = forbiddenCells.has(key);

                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={`${row + 1}행 ${col + 1}열`}
                        onClick={() => handleCellClick(row, col)}
                        disabled={isBoardLocked || Boolean(cell)}
                        className={`group relative min-h-0 min-w-0 overflow-hidden flex items-center justify-center border-b border-r border-amber-950/45 transition disabled:cursor-default ${
                          !cell && !isBoardLocked ? "hover:bg-white/20" : ""
                        } ${isWinning ? "bg-emerald-300/45" : ""} ${isForbidden ? "bg-red-400/20" : ""}`}
                      >
                        {!cell && !isBoardLocked && !isForbidden && (
                          <span className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-amber-950/70 opacity-0 group-hover:opacity-60" />
                        )}
                        {!cell && !isBoardLocked && isForbidden && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-black leading-none text-red-800 opacity-70">×</span>
                        )}
                        {cell && <Stone color={cell} isLast={isLast} />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-800">Game Status</p>
                <h2 className="mt-1 text-2xl font-black">{statusText}</h2>
                <p className="mt-2 min-h-10 text-sm leading-relaxed text-neutral-700">{message}</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button onClick={() => switchMode(MODE_AI)} active={mode === MODE_AI}>🤖 대전</Button>
                <Button onClick={() => switchMode(MODE_AI_VS_AI)} active={mode === MODE_AI_VS_AI}>⚔️ 관전</Button>
                <Button onClick={() => switchMode(MODE_TWO)} active={mode === MODE_TWO}>👥 2인</Button>
              </div>

              {mode === MODE_AI_VS_AI && (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={toggleAutoBattle} disabled={Boolean(winner)} active={isAutoRunning}>
                    {isAutoRunning ? "⏸ 일시정지" : "▶ 시작"}
                  </Button>
                  <Button onClick={() => resetGame(MODE_AI_VS_AI)}>⚔️ 새 결투</Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={undoMove} disabled={history.length === 0 || Boolean(winner)}>↩ 무르기</Button>
                <Button onClick={() => resetGame()}>↻ 다시시작</Button>
              </div>

              <div className="rounded-2xl bg-amber-50/80 p-3 ring-1 ring-amber-900/10">
                <label className="flex items-center justify-between gap-3 text-sm font-bold text-neutral-800">
                  <span>AI 속도</span>
                  <span>{aiDelay <= 180 ? "빠름" : aiDelay <= 420 ? "보통" : "느림"}</span>
                </label>
                <input
                  type="range"
                  min="120"
                  max="800"
                  step="20"
                  value={aiDelay}
                  onChange={(event) => setAiDelay(Number(event.target.value))}
                  className="mt-3 w-full accent-neutral-950"
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-3 p-5 text-sm text-neutral-700">
              <h3 className="text-lg font-black text-neutral-950">규칙</h3>
              <p>흑돌이 먼저 둡니다. 같은 색 돌 5개 이상이 한 줄로 이어지면 즉시 승리합니다.</p>
              <p>33 금수를 적용했습니다. 열린 3이 두 방향 이상 동시에 생기는 자리는 둘 수 없습니다.</p>
              <p>금수 자리는 빨간 ×로 표시됩니다. 이 버전에서는 흑돌과 백돌, 사람과 AI 모두에게 33 금수가 적용됩니다.</p>
            </div>
          </Card>

          <Card>
            <div className="grid grid-cols-3 gap-3 p-5 text-center">
              <div className="rounded-2xl bg-amber-100/80 p-3">
                <div className="text-2xl font-black">{history.length}</div>
                <div className="text-xs font-bold text-neutral-600">착수 수</div>
              </div>
              <div className="rounded-2xl bg-amber-100/80 p-3">
                <div className="text-2xl font-black">{SIZE}×{SIZE}</div>
                <div className="text-xs font-bold text-neutral-600">판 크기</div>
              </div>
              <div className="rounded-2xl bg-amber-100/80 p-3">
                <div className="text-2xl font-black">33</div>
                <div className="text-xs font-bold text-neutral-600">금수 적용</div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <MoveLog history={history} mode={mode} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<OmokGame />);
