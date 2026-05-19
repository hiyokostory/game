const { useEffect, useMemo, useRef, useState } = React;

const PIECES = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

const NAMES = {
  K: "킹",
  Q: "퀸",
  R: "룩",
  B: "비숍",
  N: "나이트",
  P: "폰",
};

const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function initialBoard() {
  return [
    ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
    ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
    ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
  ];
}

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function defaultRulesState(overrides = {}) {
  return {
    turn: "w",
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
    ...overrides,
  };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function colorOf(piece) {
  return piece ? piece[0] : null;
}

function typeOf(piece) {
  return piece ? piece[1] : null;
}

function opponent(color) {
  return color === "w" ? "b" : "w";
}

function sideName(color) {
  return color === "w" ? "흰색" : "검은색";
}

function squareName(r, c) {
  return `${FILES[c]}${8 - r}`;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === `${color}K`) return { r, c };
    }
  }
  return null;
}

function hasRookForCastle(board, color, side) {
  const row = color === "w" ? 7 : 0;
  const col = side === "k" ? 7 : 0;
  return board[row][col] === `${color}R`;
}

function rawMoves(board, r, c, state, forAttack = false) {
  const piece = board[r][c];
  if (!piece) return [];

  const color = colorOf(piece);
  const type = typeOf(piece);
  const enemy = opponent(color);
  const moves = [];

  const add = (nr, nc, extra = {}) => {
    if (!inBounds(nr, nc)) return;
    const target = board[nr][nc];
    if (!target || colorOf(target) !== color) {
      moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece, capture: target, ...extra });
    }
  };

  if (type === "P") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promotionRow = color === "w" ? 0 : 7;

    for (const dc of [-1, 1]) {
      const nr = r + dir;
      const nc = c + dc;
      if (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (forAttack) {
          moves.push({ from: { r, c }, to: { r: nr, c: nc }, piece, attackOnly: true });
        } else if (target && colorOf(target) === enemy) {
          add(nr, nc, nr === promotionRow ? { promotion: "Q" } : {});
        }
      }
    }

    if (!forAttack) {
      const one = r + dir;
      if (inBounds(one, c) && !board[one][c]) {
        add(one, c, one === promotionRow ? { promotion: "Q" } : {});
        const two = r + dir * 2;
        if (r === startRow && inBounds(two, c) && !board[two][c]) {
          add(two, c, { doublePawn: true });
        }
      }

      if (state.enPassant) {
        for (const dc of [-1, 1]) {
          const nr = r + dir;
          const nc = c + dc;
          if (state.enPassant.r === nr && state.enPassant.c === nc) {
            moves.push({
              from: { r, c },
              to: { r: nr, c: nc },
              piece,
              enPassant: true,
              capture: `${enemy}P`,
            });
          }
        }
      }
    }
  }

  if (type === "N") {
    const deltas = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of deltas) add(r + dr, c + dc);
  }

  if (["B", "R", "Q"].includes(type)) {
    const dirs = [];
    if (["B", "Q"].includes(type)) dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (["R", "Q"].includes(type)) dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          add(nr, nc);
        } else {
          if (colorOf(target) !== color) add(nr, nc);
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  if (type === "K") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr !== 0 || dc !== 0) add(r + dr, c + dc);
      }
    }

    if (!forAttack) {
      const rights = state.castling[color] || { k: false, q: false };
      const homeRow = color === "w" ? 7 : 0;
      if (r === homeRow && c === 4 && rights.k && hasRookForCastle(board, color, "k")) {
        if (!board[homeRow][5] && !board[homeRow][6]) {
          moves.push({ from: { r, c }, to: { r: homeRow, c: 6 }, piece, castle: "k" });
        }
      }
      if (r === homeRow && c === 4 && rights.q && hasRookForCastle(board, color, "q")) {
        if (!board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3]) {
          moves.push({ from: { r, c }, to: { r: homeRow, c: 2 }, piece, castle: "q" });
        }
      }
    }
  }

  return moves;
}

function isSquareAttacked(board, r, c, byColor, state) {
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      const piece = board[rr][cc];
      if (piece && colorOf(piece) === byColor) {
        const attacks = rawMoves(board, rr, cc, state, true);
        if (attacks.some((m) => m.to.r === r && m.to.c === c)) return true;
      }
    }
  }
  return false;
}

function isInCheck(board, color, state) {
  const king = findKing(board, color);
  if (!king) return true;
  return isSquareAttacked(board, king.r, king.c, opponent(color), state);
}

function makeMove(board, move, state) {
  const next = cloneBoard(board);
  const piece = move.piece;
  const color = colorOf(piece);
  const enemy = opponent(color);

  next[move.from.r][move.from.c] = null;

  if (move.enPassant) {
    const capturedPawnRow = color === "w" ? move.to.r + 1 : move.to.r - 1;
    next[capturedPawnRow][move.to.c] = null;
  }

  let placedPiece = piece;
  if (move.promotion) placedPiece = `${color}${move.promotion}`;
  next[move.to.r][move.to.c] = placedPiece;

  if (move.castle === "k") {
    const row = color === "w" ? 7 : 0;
    next[row][5] = `${color}R`;
    next[row][7] = null;
  }
  if (move.castle === "q") {
    const row = color === "w" ? 7 : 0;
    next[row][3] = `${color}R`;
    next[row][0] = null;
  }

  const castling = {
    w: { ...(state.castling?.w || { k: false, q: false }) },
    b: { ...(state.castling?.b || { k: false, q: false }) },
  };

  if (typeOf(piece) === "K") castling[color] = { k: false, q: false };
  if (typeOf(piece) === "R") {
    if (move.from.r === (color === "w" ? 7 : 0) && move.from.c === 0) castling[color].q = false;
    if (move.from.r === (color === "w" ? 7 : 0) && move.from.c === 7) castling[color].k = false;
  }
  if (move.capture && !move.enPassant) {
    if (move.to.r === (enemy === "w" ? 7 : 0) && move.to.c === 0) castling[enemy].q = false;
    if (move.to.r === (enemy === "w" ? 7 : 0) && move.to.c === 7) castling[enemy].k = false;
  }

  let enPassant = null;
  if (move.doublePawn) {
    enPassant = { r: (move.from.r + move.to.r) / 2, c: move.from.c };
  }

  return { board: next, castling, enPassant };
}

function legalMovesForPiece(board, r, c, state) {
  const piece = board[r][c];
  if (!piece) return [];
  const color = colorOf(piece);
  const candidates = rawMoves(board, r, c, state, false);

  return candidates.filter((move) => {
    if (move.castle) {
      if (isInCheck(board, color, state)) return false;
      const row = color === "w" ? 7 : 0;
      const path = move.castle === "k" ? [5, 6] : [3, 2];
      if (path.some((col) => isSquareAttacked(board, row, col, opponent(color), state))) return false;
    }
    const result = makeMove(board, move, state);
    return !isInCheck(result.board, color, { ...state, ...result });
  });
}

function allLegalMoves(board, color, state) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && colorOf(board[r][c]) === color) {
        moves.push(...legalMovesForPiece(board, r, c, state));
      }
    }
  }
  return moves;
}

function materialScore(board, color) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = colorOf(piece) === color ? 1 : -1;
      score += sign * (VALUE[typeOf(piece)] || 0);
    }
  }
  return score;
}

function evaluateMove(board, move, state) {
  let score = 0;
  const color = colorOf(move.piece);
  const enemy = opponent(color);

  if (move.capture) score += (VALUE[typeOf(move.capture)] || 0) - (VALUE[typeOf(move.piece)] || 0) * 0.08;
  if (move.promotion) score += 850;
  if (move.castle) score += 70;

  const centerBonus = 4 - (Math.abs(move.to.r - 3.5) + Math.abs(move.to.c - 3.5));
  score += centerBonus * 8;

  const result = makeMove(board, move, state);
  const newState = { ...state, ...result, turn: enemy };
  const enemyMoves = allLegalMoves(result.board, enemy, newState);
  const enemyInCheck = isInCheck(result.board, enemy, newState);

  if (enemyInCheck) score += 55;
  if (enemyInCheck && enemyMoves.length === 0) score += 100000;

  score += materialScore(result.board, color) * 0.04;

  const danger = isSquareAttacked(result.board, move.to.r, move.to.c, enemy, newState);
  if (danger && typeOf(move.piece) !== "K") score -= (VALUE[typeOf(move.piece)] || 0) * 0.3;

  const enemyBestCapture = enemyMoves.reduce((best, enemyMove) => {
    if (!enemyMove.capture) return best;
    return Math.max(best, VALUE[typeOf(enemyMove.capture)] || 0);
  }, 0);
  score -= enemyBestCapture * 0.12;

  return score;
}

function bestMove(board, color, state, difficulty = "normal") {
  const moves = allLegalMoves(board, color, state);
  if (!moves.length) return null;

  const scoredMoves = moves
    .map((move) => ({ move, score: evaluateMove(board, move, state) }))
    .sort((a, b) => b.score - a.score);

  if (difficulty === "easy") {
    const pool = scoredMoves.slice(0, Math.min(10, scoredMoves.length));
    return pool[Math.floor(Math.random() * pool.length)].move;
  }

  if (difficulty === "watch") {
    const turnCount = state.history?.length || 0;
    const topScore = scoredMoves[0].score;
    const scoreGap = turnCount < 10 ? 180 : turnCount < 24 ? 120 : 75;
    const poolSize = turnCount < 10 ? 12 : turnCount < 24 ? 9 : 6;
    const pool = scoredMoves
      .filter((item) => item.score >= topScore - scoreGap)
      .slice(0, Math.min(poolSize, scoredMoves.length));

    const weighted = pool.map((item, index) => {
      const rankBonus = Math.max(1, pool.length - index);
      const noise = 0.65 + Math.random() * 0.9;
      const checkBonus = item.move.capture ? 1.2 : 1;
      return { ...item, weight: rankBonus * noise * checkBonus };
    });
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let pick = Math.random() * totalWeight;
    for (const item of weighted) {
      pick -= item.weight;
      if (pick <= 0) return item.move;
    }
    return weighted[weighted.length - 1].move;
  }

  if (difficulty === "hard") {
    const best = scoredMoves[0];
    const almostBest = scoredMoves.filter((item) => item.score >= best.score - 12).slice(0, 3);
    return almostBest[Math.floor(Math.random() * almostBest.length)].move;
  }

  const topScore = scoredMoves[0].score;
  const closeMoves = scoredMoves.filter((item) => item.score >= topScore - 45).slice(0, 6);
  return closeMoves[Math.floor(Math.random() * closeMoves.length)].move;
}

function moveText(move) {
  if (!move) return "추천 이동이 없습니다.";
  const pieceName = NAMES[typeOf(move.piece)];
  const from = squareName(move.from.r, move.from.c);
  const to = squareName(move.to.r, move.to.c);
  if (move.castle === "k") return "킹사이드 캐슬링";
  if (move.castle === "q") return "퀸사이드 캐슬링";
  if (move.promotion) return `${pieceName} ${from} → ${to}, 퀸으로 승격`;
  if (move.capture) return `${pieceName} ${from} → ${to}, 상대 말을 잡는 수`;
  return `${pieceName} ${from} → ${to}`;
}

function boardSignature(board, turn, castling, enPassant) {
  const boardText = board.map((row) => row.map((piece) => piece || "--").join("")).join("/");
  const castleText = `${castling?.w?.k ? "K" : "-"}${castling?.w?.q ? "Q" : "-"}${castling?.b?.k ? "k" : "-"}${castling?.b?.q ? "q" : "-"}`;
  const enPassantText = enPassant ? `${enPassant.r},${enPassant.c}` : "-";
  return `${boardText}|${turn}|${castleText}|${enPassantText}`;
}

function repetitionCount(state) {
  const current = boardSignature(state.board, state.turn, state.castling, state.enPassant);
  const history = state.history || [];
  return history.reduce((count, item) => {
    const key = boardSignature(item.board, item.turn, item.castling, item.enPassant);
    return count + (key === current ? 1 : 0);
  }, 1);
}

function isInsufficientMaterial(board) {
  const pieces = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && typeOf(piece) !== "K") pieces.push({ piece, r, c });
    }
  }

  if (pieces.length === 0) return true;
  if (pieces.length === 1 && ["B", "N"].includes(typeOf(pieces[0].piece))) return true;

  const onlyBishops = pieces.length > 0 && pieces.every((item) => typeOf(item.piece) === "B");
  if (onlyBishops) {
    const colors = pieces.map((item) => (item.r + item.c) % 2);
    return colors.every((color) => color === colors[0]);
  }

  return false;
}

function getGameEndStatus(state) {
  const moves = allLegalMoves(state.board, state.turn, state);
  const check = isInCheck(state.board, state.turn, state);

  if (check && moves.length === 0) {
    const winnerColor = opponent(state.turn);
    return {
      gameOver: true,
      isMate: true,
      isStalemate: false,
      check,
      winnerColor,
      drawReason: null,
      resultText: `${sideName(winnerColor)} 승리!`,
      statusText: `체크메이트! ${sideName(winnerColor)} 승리입니다.`,
    };
  }

  if (!check && moves.length === 0) {
    return {
      gameOver: true,
      isMate: false,
      isStalemate: true,
      check,
      winnerColor: null,
      drawReason: "스테일메이트",
      resultText: "무승부!",
      statusText: "스테일메이트! 둘 수 있는 합법 수가 없어 무승부입니다.",
    };
  }

  if (isInsufficientMaterial(state.board)) {
    return {
      gameOver: true,
      isMate: false,
      isStalemate: false,
      check,
      winnerColor: null,
      drawReason: "기물 부족",
      resultText: "무승부!",
      statusText: "기물 부족으로 체크메이트가 불가능해 무승부입니다.",
    };
  }

  if ((state.halfmoveClock || 0) >= 100) {
    return {
      gameOver: true,
      isMate: false,
      isStalemate: false,
      check,
      winnerColor: null,
      drawReason: "50수 규칙",
      resultText: "무승부!",
      statusText: "50수 규칙으로 무승부입니다.",
    };
  }

  if (repetitionCount(state) >= 3) {
    return {
      gameOver: true,
      isMate: false,
      isStalemate: false,
      check,
      winnerColor: null,
      drawReason: "3회 반복",
      resultText: "무승부!",
      statusText: "같은 포지션이 3회 반복되어 무승부입니다.",
    };
  }

  return {
    gameOver: false,
    isMate: false,
    isStalemate: false,
    check,
    winnerColor: null,
    drawReason: null,
    resultText: "",
    statusText: "",
  };
}

function isAiTurnByMode(mode, turn) {
  return (
    (mode === "human-vs-ai" && turn === "b") ||
    (mode === "ai-vs-human" && turn === "w") ||
    mode === "ai-vs-ai"
  );
}

function buildNextStateAfterMove(prev, move, movedByAi = false) {
  const result = makeMove(prev.board, move, prev);
  const nextTurn = opponent(prev.turn);
  const nextHalfmoveClock = typeOf(move.piece) === "P" || move.capture ? 0 : (prev.halfmoveClock || 0) + 1;

  const historyItem = {
    board: prev.board,
    turn: prev.turn,
    castling: prev.castling,
    enPassant: prev.enPassant,
    halfmoveClock: prev.halfmoveClock || 0,
    message: prev.message,
  };

  const nextStateBase = {
    ...prev,
    board: result.board,
    turn: nextTurn,
    selected: null,
    castling: result.castling,
    enPassant: result.enPassant,
    halfmoveClock: nextHalfmoveClock,
    aiThinking: false,
    history: [...prev.history, historyItem],
  };

  const actor = `${sideName(prev.turn)}${movedByAi ? " AI" : ""}`;
  const endStatus = getGameEndStatus(nextStateBase);
  let message = `${actor}가 ${moveText(move)} 이동했습니다.`;

  if (endStatus.gameOver) {
    message = endStatus.statusText;
  } else if (endStatus.check) {
    message += " 체크!";
  }

  return {
    ...nextStateBase,
    message,
  };
}

function runChessLogicTests() {
  const results = [];
  const test = (name, fn) => {
    try {
      const ok = Boolean(fn());
      results.push({ name, ok });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  };

  test("초기 위치에서 흰색 폰 e2는 e3/e4로 이동할 수 있다", () => {
    const board = initialBoard();
    const state = defaultRulesState({ board });
    const moves = legalMovesForPiece(board, 6, 4, state).map((m) => squareName(m.to.r, m.to.c));
    return moves.includes("e3") && moves.includes("e4");
  });

  test("초기 위치에서 흰색 나이트 g1은 e2/f3/h3로 이동할 수 있다", () => {
    const board = initialBoard();
    const state = defaultRulesState({ board });
    const moves = legalMovesForPiece(board, 7, 6, state).map((m) => squareName(m.to.r, m.to.c));
    return moves.includes("e2") && moves.includes("f3") && moves.includes("h3") && moves.length === 3;
  });

  test("킹을 체크에 노출시키는 이동은 합법 이동에서 제외된다", () => {
    const board = emptyBoard();
    board[7][4] = "wK";
    board[7][0] = "wR";
    board[0][4] = "bR";
    board[0][0] = "bK";
    const state = defaultRulesState({ board, castling: { w: { k: false, q: false }, b: { k: false, q: false } } });
    const moves = legalMovesForPiece(board, 7, 0, state);
    return !moves.some((m) => m.to.r === 6 && m.to.c === 0);
  });

  test("폰이 마지막 줄로 이동하면 퀸 승격 플래그가 붙는다", () => {
    const board = emptyBoard();
    board[1][0] = "wP";
    board[7][4] = "wK";
    board[0][4] = "bK";
    const state = defaultRulesState({ board, castling: { w: { k: false, q: false }, b: { k: false, q: false } } });
    const moves = legalMovesForPiece(board, 1, 0, state);
    return moves.some((m) => m.to.r === 0 && m.to.c === 0 && m.promotion === "Q");
  });

  test("추천 이동은 현재 차례의 합법 이동 중 하나다", () => {
    const board = initialBoard();
    const state = defaultRulesState({ board });
    const recommended = bestMove(board, "w", state);
    const legal = allLegalMoves(board, "w", state);
    return Boolean(recommended) && legal.some((m) => m.from.r === recommended.from.r && m.from.c === recommended.from.c && m.to.r === recommended.to.r && m.to.c === recommended.to.c);
  });

  test("AI 난이도 easy/normal/hard 모두 합법 수를 반환한다", () => {
    const board = initialBoard();
    const state = defaultRulesState({ board });
    const legal = allLegalMoves(board, "w", state);
    return ["easy", "normal", "hard", "watch"].every((level) => {
      const aiMove = bestMove(board, "w", state, level);
      return Boolean(aiMove) && legal.some((m) => m.from.r === aiMove.from.r && m.from.c === aiMove.from.c && m.to.r === aiMove.to.r && m.to.c === aiMove.to.c);
    });
  });

  test("AI 대전 판정 함수가 모드별 차례를 올바르게 구분한다", () => {
    return (
      !isAiTurnByMode("human-vs-ai", "w") &&
      isAiTurnByMode("human-vs-ai", "b") &&
      isAiTurnByMode("ai-vs-human", "w") &&
      !isAiTurnByMode("ai-vs-human", "b") &&
      isAiTurnByMode("ai-vs-ai", "w") &&
      isAiTurnByMode("ai-vs-ai", "b")
    );
  });

  test("스테일메이트 상황을 무승부로 판정한다", () => {
    const board = emptyBoard();
    board[0][0] = "bK";
    board[1][2] = "wK";
    board[2][1] = "wQ";
    const state = defaultRulesState({
      board,
      turn: "b",
      castling: { w: { k: false, q: false }, b: { k: false, q: false } },
    });
    const status = getGameEndStatus(state);
    return status.gameOver && status.isStalemate && status.drawReason === "스테일메이트";
  });

  test("같은 포지션 3회 반복을 무승부로 판정한다", () => {
    const board = emptyBoard();
    board[7][4] = "wK";
    board[0][4] = "bK";
    board[7][0] = "wR";
    const state = defaultRulesState({
      board,
      turn: "w",
      castling: { w: { k: false, q: false }, b: { k: false, q: false } },
      history: [
        { board: cloneBoard(board), turn: "w", castling: { w: { k: false, q: false }, b: { k: false, q: false } }, enPassant: null },
        { board: cloneBoard(board), turn: "w", castling: { w: { k: false, q: false }, b: { k: false, q: false } }, enPassant: null },
      ],
    });
    const status = getGameEndStatus(state);
    return status.gameOver && status.drawReason === "3회 반복";
  });

  test("킹만 남은 상황은 기물 부족 무승부로 판정한다", () => {
    const board = emptyBoard();
    board[7][4] = "wK";
    board[0][4] = "bK";
    const state = defaultRulesState({
      board,
      turn: "w",
      castling: { w: { k: false, q: false }, b: { k: false, q: false } },
    });
    const status = getGameEndStatus(state);
    return status.gameOver && status.drawReason === "기물 부족";
  });

  return results;
}

function Icon({ label }) {
  return <span className="inline-flex h-4 w-4 items-center justify-center text-base leading-none">{label}</span>;
}

function Panel({ children, className = "" }) {
  return <section className={`rounded-3xl border border-slate-700 bg-slate-900/70 shadow-xl ${className}`}>{children}</section>;
}

function PanelBody({ children, className = "" }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

function GameButton({ children, onClick, variant = "default", className = "", disabled = false }) {
  const styles = {
    default: "bg-sky-500 text-white hover:bg-sky-400",
    secondary: "bg-slate-700 text-slate-100 hover:bg-slate-600",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function SelectBox({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-bold text-slate-100 outline-none transition focus:border-sky-400"
      >
        {children}
      </select>
    </label>
  );
}

function modeLabel(mode) {
  if (mode === "human-vs-human") return "친구와 하기";
  if (mode === "human-vs-ai") return "사람 VS AI · 나는 흰색";
  if (mode === "ai-vs-human") return "AI VS 사람 · 나는 검은색";
  if (mode === "ai-vs-ai") return "AI VS AI 관전";
  return "대전 모드";
}

function StartScreen({ state, setState, startGame, testResults, allTestsPassed }) {
  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="w-full">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-300/10 px-3 py-1 text-sm text-amber-200 ring-1 ring-amber-200/20">
              <Icon label="♛" /> 체스 연습 게임
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">체스 시작 설정</h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              게임을 시작하기 전에 대전 방식을 고르세요. AI 대전을 선택하면 내가 흰색으로 먼저 둘지, 검은색으로 후공할지도 정할 수 있습니다.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setState((p) => ({ ...p, setupMode: "human" }))}
              className={`rounded-3xl border p-5 text-left transition ${state.setupMode === "human" ? "border-sky-300 bg-sky-400/15 shadow-xl" : "border-slate-700 bg-slate-900/70 hover:bg-slate-800"}`}
            >
              <div className="text-3xl">👥</div>
              <h2 className="mt-3 text-xl font-black">친구와 하기</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">친구와 함께 즐길 수 있는 모드입니다.</p>
            </button>

            <button
              type="button"
              onClick={() => setState((p) => ({ ...p, setupMode: "ai" }))}
              className={`rounded-3xl border p-5 text-left transition ${state.setupMode === "ai" ? "border-amber-300 bg-amber-300/15 shadow-xl" : "border-slate-700 bg-slate-900/70 hover:bg-slate-800"}`}
            >
              <div className="text-3xl">🤖</div>
              <h2 className="mt-3 text-xl font-black">AI와 대전</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">내가 원하는 색을 고르고 AI와 체스를 둡니다.</p>
            </button>

            <button
              type="button"
              onClick={() => setState((p) => ({ ...p, setupMode: "watch" }))}
              className={`rounded-3xl border p-5 text-left transition ${state.setupMode === "watch" ? "border-violet-300 bg-violet-300/15 shadow-xl" : "border-slate-700 bg-slate-900/70 hover:bg-slate-800"}`}
            >
              <div className="text-3xl">👁️</div>
              <h2 className="mt-3 text-xl font-black">AI끼리 관전</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">흰색 AI와 검은색 AI가 자동으로 대전합니다.</p>
            </button>
          </div>

          <Panel className="mt-5">
            <PanelBody>
              <div className={`grid gap-4 ${state.setupMode === "human" ? "md:grid-cols-1" : "md:grid-cols-3"}`}>
                {state.setupMode === "ai" ? (
                  <SelectBox
                    label="내가 시작할 말"
                    value={state.setupPlayerColor}
                    onChange={(setupPlayerColor) => setState((p) => ({ ...p, setupPlayerColor }))}
                  >
                    <option value="w">흰색 · 선공</option>
                    <option value="b">검은색 · 후공</option>
                  </SelectBox>
                ) : (
                  <div className="rounded-2xl bg-slate-800 p-4 text-sm leading-6 text-slate-300">
                    {state.setupMode === "human" ? "친구와 함께 즐길 수 있는 모드입니다." : "AI 관전 모드는 흰색 AI가 먼저 시작합니다."}
                  </div>
                )}

                {state.setupMode !== "human" && (
                  <>
                    <SelectBox
                      label="AI 난이도"
                      value={state.aiDifficulty}
                      onChange={(aiDifficulty) => setState((p) => ({ ...p, aiDifficulty }))}
                    >
                      <option value="easy">쉬움: 약간 랜덤</option>
                      <option value="normal">보통: 좋은 수 중 랜덤</option>
                      <option value="hard">어려움: 최고 평가 수</option>
                    </SelectBox>

                    <SelectBox
                      label="AI 이동 속도"
                      value={String(state.aiDelay)}
                      onChange={(aiDelay) => setState((p) => ({ ...p, aiDelay: Number(aiDelay) }))}
                    >
                      <option value="250">빠름</option>
                      <option value="650">보통</option>
                      <option value="1200">느림</option>
                    </SelectBox>
                  </>
                )}
              </div>

              <GameButton onClick={startGame} variant="success" className="mt-5 w-full py-3 text-base">
                ▶ 게임 시작
              </GameButton>
            </PanelBody>
          </Panel>

          </div>
      </div>
    </div>
  );
}

function ChessWithMoveHints() {
  const aiTimer = useRef(null);
  const testResults = useMemo(() => runChessLogicTests(), []);
  const allTestsPassed = testResults.every((result) => result.ok);

  const [state, setState] = useState({
    started: false,
    setupMode: "ai",
    setupPlayerColor: "w",
    board: initialBoard(),
    turn: "w",
    selected: null,
    history: [],
    showHint: true,
    showAllMoves: false,
    showTests: false,
    gameMode: "human-vs-ai",
    aiDifficulty: "normal",
    aiDelay: 650,
    aiPaused: false,
    aiThinking: false,
    halfmoveClock: 0,
    message: "흰색 차례입니다. 말을 클릭하면 이동 가능한 칸이 표시됩니다.",
    castling: { w: { k: true, q: true }, b: { k: true, q: true } },
    enPassant: null,
  });

  const legalForSelected = useMemo(() => {
    if (!state.selected) return [];
    return legalMovesForPiece(state.board, state.selected.r, state.selected.c, state);
  }, [state.board, state.selected, state.turn, state.enPassant, state.castling]);

  const currentMoves = useMemo(
    () => allLegalMoves(state.board, state.turn, state),
    [state.board, state.turn, state.enPassant, state.castling]
  );

  const recommended = useMemo(
    () => bestMove(state.board, state.turn, state, "hard"),
    [state.board, state.turn, state.enPassant, state.castling]
  );

  const isAiTurn = state.started && isAiTurnByMode(state.gameMode, state.turn);
  const endStatus = getGameEndStatus(state);
  const check = endStatus.check;
  const isMate = endStatus.isMate;
  const isStalemate = endStatus.isStalemate;
  const gameOver = endStatus.gameOver;

  useEffect(() => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    if (!state.started || !isAiTurn || state.aiPaused || state.aiThinking || gameOver) return undefined;

    setState((prev) => ({
      ...prev,
      selected: null,
      aiThinking: true,
      message: `${sideName(prev.turn)} AI가 수를 생각하는 중입니다...`,
    }));

    aiTimer.current = setTimeout(() => {
      setState((prev) => {
        const stillAiTurn = isAiTurnByMode(prev.gameMode, prev.turn);
        const moves = allLegalMoves(prev.board, prev.turn, prev);
        const inCheck = isInCheck(prev.board, prev.turn, prev);
        const over = moves.length === 0 || (inCheck && moves.length === 0);

        if (!stillAiTurn || prev.aiPaused || over) {
          return { ...prev, aiThinking: false };
        }

        const aiMove = bestMove(
          prev.board,
          prev.turn,
          prev,
          prev.gameMode === "ai-vs-ai" ? "watch" : prev.aiDifficulty
        );
        if (!aiMove) return { ...prev, aiThinking: false, message: "AI가 둘 수 있는 수가 없습니다." };
        return buildNextStateAfterMove(prev, aiMove, true);
      });
    }, state.aiDelay);

    return () => {
      if (aiTimer.current) clearTimeout(aiTimer.current);
    };
  }, [state.started, state.board, state.turn, state.gameMode, state.aiDifficulty, state.aiDelay, state.aiPaused, isAiTurn, gameOver]);

  const startGame = () => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    const gameMode =
      state.setupMode === "human"
        ? "human-vs-human"
        : state.setupMode === "watch"
          ? "ai-vs-ai"
          : state.setupPlayerColor === "w"
            ? "human-vs-ai"
            : "ai-vs-human";

    setState((prev) => ({
      ...prev,
      started: true,
      gameMode,
      board: initialBoard(),
      turn: "w",
      selected: null,
      history: [],
      aiPaused: false,
      aiThinking: false,
      halfmoveClock: 0,
      message:
        gameMode === "ai-vs-human"
          ? "게임 시작! 흰색 AI가 먼저 둡니다. 당신은 검은색입니다."
          : gameMode === "ai-vs-ai"
            ? "AI VS AI 관전을 시작합니다. 흰색 AI가 먼저 둡니다."
            : gameMode === "human-vs-ai"
              ? "게임 시작! 당신은 흰색입니다. 말을 클릭해서 먼저 두세요."
              : "게임 시작! 흰색 차례입니다.",
      castling: { w: { k: true, q: true }, b: { k: true, q: true } },
      enPassant: null,
    }));
  };

  const reset = () => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setState((prev) => ({
      ...prev,
      started: false,
      board: initialBoard(),
      turn: "w",
      selected: null,
      history: [],
      aiThinking: false,
      aiPaused: false,
      halfmoveClock: 0,
      message: "새 게임 설정 화면으로 돌아왔습니다.",
      castling: { w: { k: true, q: true }, b: { k: true, q: true } },
      enPassant: null,
    }));
  };

  const undo = () => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setState((prev) => {
      if (!prev.history.length) return { ...prev, message: "되돌릴 수 있는 수가 없습니다." };
      const last = prev.history[prev.history.length - 1];
      return {
        ...prev,
        ...last,
        halfmoveClock: last.halfmoveClock || 0,
        history: prev.history.slice(0, -1),
        selected: null,
        aiThinking: false,
        message: "한 수를 되돌렸습니다.",
      };
    });
  };

  const applyMove = (move) => {
    setState((prev) => buildNextStateAfterMove(prev, move, false));
  };

  const onSquareClick = (r, c) => {
    if (!state.started || gameOver) return;
    if (isAiTurn || state.aiThinking) {
      setState((prev) => ({ ...prev, message: "AI 차례입니다. 잠시 후 AI가 자동으로 둡니다." }));
      return;
    }

    const piece = state.board[r][c];

    if (state.selected) {
      const chosen = legalForSelected.find((m) => m.to.r === r && m.to.c === c);
      if (chosen) {
        applyMove(chosen);
        return;
      }
    }

    if (piece && colorOf(piece) === state.turn) {
      setState((prev) => ({
        ...prev,
        selected: { r, c },
        message: `${sideName(prev.turn)} ${NAMES[typeOf(piece)]} 선택됨: 초록색 칸으로 이동할 수 있습니다.`,
      }));
    } else {
      setState((prev) => ({ ...prev, selected: null, message: "내 차례의 말을 먼저 선택하세요." }));
    }
  };

  const setGameMode = (gameMode) => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    const setupMode = gameMode === "human-vs-human" ? "human" : gameMode === "ai-vs-ai" ? "watch" : "ai";
    const setupPlayerColor = gameMode === "ai-vs-human" ? "b" : "w";
    setState((prev) => ({
      ...prev,
      started: false,
      gameMode,
      setupMode,
      setupPlayerColor,
      selected: null,
      aiThinking: false,
      halfmoveClock: 0,
      message: "시작 설정 화면으로 돌아왔습니다.",
    }));
  };

  const setAiDifficulty = (aiDifficulty) => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setState((prev) => ({
      ...prev,
      aiDifficulty,
      aiPaused: prev.started && prev.gameMode !== "human-vs-human" ? true : prev.aiPaused,
      aiThinking: false,
      halfmoveClock: 0,
      message: prev.started && prev.gameMode !== "human-vs-human"
        ? `AI 난이도를 ${aiDifficulty === "easy" ? "쉬움" : aiDifficulty === "hard" ? "어려움" : "보통"}으로 변경했습니다. AI 진행을 일시정지했습니다.`
        : `AI 난이도를 ${aiDifficulty === "easy" ? "쉬움" : aiDifficulty === "hard" ? "어려움" : "보통"}으로 변경했습니다.`,
    }));
  };

  const setAiDelay = (value) => {
    if (aiTimer.current) clearTimeout(aiTimer.current);
    setState((prev) => ({
      ...prev,
      aiDelay: Number(value),
      aiPaused: prev.started && prev.gameMode !== "human-vs-human" ? true : prev.aiPaused,
      aiThinking: false,
      halfmoveClock: 0,
      message: prev.started && prev.gameMode !== "human-vs-human"
        ? "AI 이동 속도를 변경했습니다. AI 진행을 일시정지했습니다."
        : "AI 이동 속도를 변경했습니다.",
    }));
  };

  const isLegalTarget = (r, c) => legalForSelected.some((m) => m.to.r === r && m.to.c === c);
  const isAllMoveTarget = (r, c) => state.showAllMoves && currentMoves.some((m) => m.to.r === r && m.to.c === c);
  const isRecommendedFrom = (r, c) => state.showHint && recommended && recommended.from.r === r && recommended.from.c === c;
  const isRecommendedTo = (r, c) => state.showHint && recommended && recommended.to.r === r && recommended.to.c === c;
  const selectedPiece = state.selected ? state.board[state.selected.r][state.selected.c] : null;

  if (!state.started) {
    return (
      <StartScreen
        state={state}
        setState={setState}
        startGame={startGame}
        testResults={testResults}
        allTestsPassed={allTestsPassed}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-300/10 px-3 py-1 text-sm text-amber-200 ring-1 ring-amber-200/20">
              <Icon label="♛" /> 체스 연습 게임
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">체스판</h1>
            <p className="mt-2 text-sm text-slate-300 md:text-base">
              친구와 함께 플레이하거나 AI와 대전할 수 있습니다. AI VS AI 관전 모드도 지원합니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <GameButton onClick={() => setState((p) => ({ ...p, showHint: !p.showHint }))}>
              <Icon label={state.showHint ? "🙈" : "👁"} /> {state.showHint ? "힌트 숨기기" : "힌트 보기"}
            </GameButton>
            <GameButton onClick={() => setState((p) => ({ ...p, showAllMoves: !p.showAllMoves }))} variant="secondary">
              <Icon label="💡" /> 전체 이동칸
            </GameButton>
            <GameButton onClick={undo} variant="secondary">↩ 한 수 되돌리기</GameButton>
            <GameButton onClick={reset} variant="danger">↻ 새 게임 설정</GameButton>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Panel className="overflow-hidden shadow-2xl">
            <PanelBody className="p-3 md:p-5">
              <div className="mx-auto aspect-square w-full max-w-[720px] overflow-hidden rounded-2xl border border-slate-700 shadow-inner">
                <div className="grid h-full w-full grid-cols-8 grid-rows-8">
                  {state.board.map((row, r) =>
                    row.map((piece, c) => {
                      const light = (r + c) % 2 === 0;
                      const selected = state.selected && state.selected.r === r && state.selected.c === c;
                      const target = isLegalTarget(r, c);
                      const allTarget = isAllMoveTarget(r, c);
                      const recFrom = isRecommendedFrom(r, c);
                      const recTo = isRecommendedTo(r, c);
                      const kingHere = piece === `${state.turn}K` && check;

                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          onClick={() => onSquareClick(r, c)}
                          className={`relative flex items-center justify-center transition-all ${
                            light ? "bg-stone-200 text-slate-950" : "bg-emerald-800 text-white"
                          } ${selected ? "ring-4 ring-sky-300 ring-inset" : ""} ${kingHere ? "animate-pulse ring-4 ring-red-400 ring-inset" : ""}`}
                          aria-label={`${squareName(r, c)} ${piece ? NAMES[typeOf(piece)] : "빈칸"}`}
                        >
                          <span className="absolute left-1 top-1 text-[10px] font-bold opacity-50 md:text-xs">
                            {c === 0 ? 8 - r : ""}
                          </span>
                          <span className="absolute bottom-1 right-1 text-[10px] font-bold opacity-50 md:text-xs">
                            {r === 7 ? FILES[c] : ""}
                          </span>

                          {allTarget && !target && (
                            <span className="absolute h-4 w-4 rounded-full bg-sky-400/50 md:h-5 md:w-5" />
                          )}
                          {target && !piece && (
                            <span className="absolute h-5 w-5 rounded-full bg-lime-400/80 shadow-lg md:h-7 md:w-7" />
                          )}
                          {target && piece && (
                            <span className="absolute h-[76%] w-[76%] rounded-full border-4 border-lime-300 shadow-lg" />
                          )}
                          {recFrom && (
                            <span className="absolute inset-1 rounded-xl border-4 border-amber-300" />
                          )}
                          {recTo && (
                            <span className="absolute inset-2 rounded-xl bg-amber-300/35" />
                          )}

                          <span
                            className={`relative z-10 select-none text-4xl drop-shadow transition-transform duration-150 md:text-6xl ${
                              piece ? "scale-100" : "scale-0"
                            } ${piece?.[0] === "w" ? "text-white [text-shadow:0_2px_4px_rgba(0,0,0,.65)]" : "text-slate-950 [text-shadow:0_1px_1px_rgba(255,255,255,.45)]"}`}
                          >
                            {piece ? PIECES[piece] : ""}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </PanelBody>
          </Panel>

          <aside className="space-y-4">
            <Panel>
              <PanelBody>
                <h2 className="mb-3 text-xl font-black">대전 설정</h2>
                <div className="grid gap-3">
                  <div className="rounded-2xl bg-slate-800 p-4 text-sm leading-6 text-slate-200">
                    <p className="font-bold text-slate-100">현재 모드</p>
                    <p className="mt-1">{modeLabel(state.gameMode)}</p>
                  </div>
                  {state.gameMode !== "human-vs-human" && (
                    <>
                      <SelectBox label="AI 난이도" value={state.aiDifficulty} onChange={setAiDifficulty}>
                        <option value="easy">쉬움: 약간 랜덤</option>
                        <option value="normal">보통: 좋은 수 중 랜덤</option>
                        <option value="hard">어려움: 최고 평가 수</option>
                      </SelectBox>
                      <SelectBox label="AI 이동 속도" value={String(state.aiDelay)} onChange={setAiDelay}>
                        <option value="250">빠름</option>
                        <option value="650">보통</option>
                        <option value="1200">느림</option>
                      </SelectBox>
                      <GameButton
                        onClick={() => setState((p) => ({ ...p, aiPaused: !p.aiPaused, aiThinking: false, message: p.aiPaused ? "AI 자동 진행을 재개했습니다." : "AI 자동 진행을 일시정지했습니다." }))}
                        variant={state.aiPaused ? "success" : "secondary"}
                        className="w-full"
                      >
                        {state.aiPaused ? "▶ AI 진행 재개" : "⏸ AI 진행 일시정지"}
                      </GameButton>
                    </>
                  )}
                  <GameButton onClick={() => setGameMode(state.gameMode)} variant="secondary" className="w-full">
                    ⚙ 시작 설정으로 돌아가기
                  </GameButton>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">현재 상태</h2>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${state.turn === "w" ? "bg-white text-slate-950" : "bg-slate-800 text-white ring-1 ring-slate-600"}`}>
                    {sideName(state.turn)} 차례
                  </span>
                </div>
                <p className="rounded-2xl bg-slate-800/80 p-4 text-sm leading-6 text-slate-200">{state.message}</p>
                {isAiTurn && !state.aiPaused && !gameOver && (
                  <div className="mt-3 rounded-2xl bg-violet-400/15 p-3 text-sm font-bold text-violet-200 ring-1 ring-violet-300/20">
                    AI가 자동으로 둘 차례입니다.
                  </div>
                )}
                {check && !isMate && (
                  <div className="mt-3 rounded-2xl bg-red-500/15 p-3 text-sm font-bold text-red-200 ring-1 ring-red-300/20">
                    체크 상태입니다. 킹을 안전하게 만들어야 합니다.
                  </div>
                )}
                {isMate && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-400/15 p-3 text-sm font-bold text-amber-200 ring-1 ring-amber-300/20">
                    <Icon label="🏁" /> 체크메이트로 게임 종료
                  </div>
                )}
                {isStalemate && (
                  <div className="mt-3 rounded-2xl bg-sky-400/15 p-3 text-sm font-bold text-sky-200 ring-1 ring-sky-300/20">
                    스테일메이트로 무승부입니다.
                  </div>
                )}
                {gameOver && (
                  <div className="mt-4 rounded-3xl bg-slate-800 p-4 ring-1 ring-slate-600">
                    <h3 className="text-lg font-black text-slate-100">게임 결과</h3>
                    <p className="mt-2 rounded-2xl bg-slate-900/80 p-3 text-center text-xl font-black text-amber-200">
                      {endStatus.resultText}
                    </p>
                    {endStatus.drawReason && (
                      <p className="mt-2 rounded-2xl bg-slate-900/60 p-3 text-center text-sm font-bold text-slate-300">
                        종료 사유: {endStatus.drawReason}
                      </p>
                    )}
                    <div className="mt-3 grid gap-2">
                      <GameButton onClick={startGame} variant="success" className="w-full">
                        ↻ 같은 설정으로 재시작
                      </GameButton>
                      <GameButton onClick={reset} variant="secondary" className="w-full">
                        ⚙ 시작 설정으로 돌아가기
                      </GameButton>
                    </div>
                  </div>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody>
                <h2 className="mb-3 flex items-center gap-2 text-xl font-black">
                  <Icon label="💡" /> 이동 힌트
                </h2>
                <div className="rounded-2xl bg-amber-300/10 p-4 ring-1 ring-amber-200/20">
                  <p className="text-sm text-amber-100">
                    {state.showHint ? moveText(recommended) : "힌트가 숨겨져 있습니다."}
                  </p>
                  {state.showHint && recommended && (
                    <p className="mt-2 text-xs text-slate-300">
                      노란 테두리는 추천 말, 노란 배경은 추천 도착 칸입니다.
                    </p>
                  )}
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody>
                <h2 className="mb-3 text-xl font-black">선택한 말</h2>
                {selectedPiece ? (
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-5xl">{PIECES[selectedPiece]}</span>
                      <div>
                        <p className="font-bold">{sideName(state.turn)} {NAMES[typeOf(selectedPiece)]}</p>
                        <p className="text-sm text-slate-300">현재 위치: {squareName(state.selected.r, state.selected.c)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">이동 가능: {legalForSelected.length}칸</p>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-slate-800 p-4 text-sm text-slate-300">
                    아직 선택한 말이 없습니다. 내 차례의 말을 클릭해보세요.
                  </p>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody className="text-sm leading-6 text-slate-300">
                <h2 className="mb-2 text-xl font-black text-slate-100">표시 설명</h2>
                <p>초록 원: 이동 가능 칸</p>
                <p>초록 테두리: 잡을 수 있는 상대 말</p>
                <p>노란 표시: 추천 이동</p>
                <p>빨간 킹 표시: 체크 상태</p>
              </PanelBody>
            </Panel>

            
          </aside>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ChessWithMoveHints />);
