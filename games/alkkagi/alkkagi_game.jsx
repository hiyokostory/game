const { useEffect, useMemo, useRef, useState } = React;

const RADIUS = 0.028;
const FRICTION = 0.985;
const STOP_SPEED = 0.0045;
const MAX_POWER = 5.7;
const MIN_SHOT_POWER = 0.08;
const MAX_PULL_DISTANCE = 0.42;
const BOARD_PADDING = 0.09;
const GOBAN_MIN = 0.08;
const GOBAN_MAX = 0.92;
const STONE_COUNT_OPTIONS = [6, 8, 10, 12, 16];

const ROW_PATTERNS = {
  6: [3, 3],
  8: [4, 4],
  10: [4, 3, 3],
  12: [4, 4, 4],
  16: [4, 4, 4, 4],
};

function makeInitialStones(stonesPerTeam = 8) {
  let id = 1;

  const makeTeam = (team, isTop) => {
    const pattern = ROW_PATTERNS[stonesPerTeam] || [4, 4];
    const xGap = 0.095;
    const yGap = 0.075;
    const startY = isTop ? 0.20 : 0.80;
    const stones = [];

    pattern.forEach((countInRow, rowIndex) => {
      const totalWidth = (countInRow - 1) * xGap;
      const rowStartX = 0.5 - totalWidth / 2;

      for (let i = 0; i < countInRow; i++) {
        stones.push({
          id: id++,
          team,
          x: rowStartX + i * xGap,
          y: isTop ? startY + rowIndex * yGap : startY - rowIndex * yGap,
          vx: 0,
          vy: 0,
          alive: true,
          label: stones.length + 1,
        });
      }
    });

    return stones;
  };

  return [...makeTeam("black", true), ...makeTeam("white", false)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

function normalize(x, y) {
  const len = length(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function distance(a, b) {
  return length(a.x - b.x, a.y - b.y);
}

function teamName(team) {
  return team === "black" ? "흑돌" : "백돌";
}

function oppositeTeam(team) {
  return team === "black" ? "white" : "black";
}

function edgeDanger(stone) {
  const left = stone.x - BOARD_PADDING;
  const right = 1 - BOARD_PADDING - stone.x;
  const top = stone.y - BOARD_PADDING;
  const bottom = 1 - BOARD_PADDING - stone.y;
  return 1 - clamp(Math.min(left, right, top, bottom) / 0.25, 0, 1);
}

function nearestExitVector(stone) {
  const exits = [
    { x: -1, y: 0, distance: stone.x - BOARD_PADDING },
    { x: 1, y: 0, distance: 1 - BOARD_PADDING - stone.x },
    { x: 0, y: -1, distance: stone.y - BOARD_PADDING },
    { x: 0, y: 1, distance: 1 - BOARD_PADDING - stone.y },
  ];

  return exits.sort((a, b) => a.distance - b.distance)[0];
}

function difficultyLabel(value) {
  if (value === "easy") return "쉬움";
  if (value === "hard") return "어려움";
  return "보통";
}

function sideRoleLabel(team, playerTeam, mode) {
  if (mode !== "ai") return "";
  return team === playerTeam ? "플레이어" : "AI";
}

function AlkkagiGame() {
  const boardRef = useRef(null);
  const stonesPerTeamRef = useRef(8);
  const stonesRef = useRef(makeInitialStones(stonesPerTeamRef.current));
  const turnRef = useRef("black");
  const modeRef = useRef("pvp");
  const playerTeamRef = useRef("black");
  const difficultyRef = useRef("normal");
  const lastShotTeamRef = useRef(null);
  const historyRef = useRef([]);
  const animatingRef = useRef(false);
  const frameRef = useRef(null);
  const aiTimerRef = useRef(null);
  const powerHoldDelayRef = useRef(null);
  const powerHoldIntervalRef = useRef(null);

  const [stones, setStones] = useState(stonesRef.current);
  const [turn, setTurn] = useState(turnRef.current);
  const [mode, setMode] = useState("pvp");
  const [playerTeam, setPlayerTeam] = useState("black");
  const [difficulty, setDifficulty] = useState("normal");
  const [stonesPerTeam, setStonesPerTeam] = useState(8);
  const [selectedId, setSelectedId] = useState(null);
  const [aim, setAim] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [message, setMessage] = useState("흑돌부터 시작합니다. 내 돌을 누른 뒤 반대 방향으로 당겨서 놓으세요.");
  const [winner, setWinner] = useState(null);
  const [powerScale, setPowerScale] = useState(1);

  const aiTeam = oppositeTeam(playerTeam);

  const counts = useMemo(() => {
    return stones.reduce(
      (acc, stone) => {
        if (stone.alive) acc[stone.team] += 1;
        return acc;
      },
      { black: 0, white: 0 }
    );
  }, [stones]);

  const isAiTurn = mode === "ai" && turn === aiTeam && !isMoving && !winner;
  const canHumanInteract = !isMoving && !winner && !isAiTurn;

  const syncStones = (next) => {
    stonesRef.current = next;
    setStones(next.map((stone) => ({ ...stone })));
  };

  const syncTurn = (nextTurn) => {
    turnRef.current = nextTurn;
    setTurn(nextTurn);
  };

  const stopPowerHold = () => {
    if (powerHoldDelayRef.current) clearTimeout(powerHoldDelayRef.current);
    if (powerHoldIntervalRef.current) clearInterval(powerHoldIntervalRef.current);
    powerHoldDelayRef.current = null;
    powerHoldIntervalRef.current = null;
  };

  const adjustPower = (delta) => {
    setPowerScale((prev) => {
      const next = clamp(prev + delta, 0.6, 3);
      return Math.round(next * 20) / 20;
    });
  };

  const startPowerHold = (delta) => {
    stopPowerHold();
    adjustPower(delta);
    powerHoldDelayRef.current = setTimeout(() => {
      powerHoldIntervalRef.current = setInterval(() => adjustPower(delta), 70);
    }, 260);
  };

  const resetGame = (nextMode = modeRef.current, nextCount = stonesPerTeamRef.current, nextPlayerTeam = playerTeamRef.current) => {
    const fresh = makeInitialStones(nextCount);
    historyRef.current = [];
    lastShotTeamRef.current = null;
    animatingRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

    syncStones(fresh);
    syncTurn("black");
    setSelectedId(null);
    setAim(null);
    setIsMoving(false);
    setWinner(null);

    if (nextMode === "ai") {
      const nextAiTeam = oppositeTeam(nextPlayerTeam);
      setMessage(
        nextPlayerTeam === "black"
          ? "AI 대전입니다. 플레이어는 흑돌, AI는 백돌입니다. 플레이어가 먼저 시작합니다."
          : `AI 대전입니다. 플레이어는 백돌, AI는 흑돌입니다. AI가 먼저 시작합니다.`
      );
      if (nextAiTeam === "black") {
        lastShotTeamRef.current = null;
      }
    } else {
      setMessage("새 게임입니다. 흑돌부터 시작합니다.");
    }
  };

  const changeMode = (nextMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
    resetGame(nextMode, stonesPerTeamRef.current, playerTeamRef.current);
  };

  const changePlayerTeam = (nextPlayerTeam) => {
    playerTeamRef.current = nextPlayerTeam;
    setPlayerTeam(nextPlayerTeam);
    resetGame(modeRef.current, stonesPerTeamRef.current, nextPlayerTeam);
  };

  const changeDifficulty = (nextDifficulty) => {
    difficultyRef.current = nextDifficulty;
    setDifficulty(nextDifficulty);
    setMessage(`AI 난이도를 ${difficultyLabel(nextDifficulty)}으로 바꿨습니다.`);
  };

  const changeStoneCount = (nextCount) => {
    stonesPerTeamRef.current = nextCount;
    setStonesPerTeam(nextCount);
    resetGame(modeRef.current, nextCount, playerTeamRef.current);
    setMessage(`돌 개수를 팀당 ${nextCount}개로 바꿨습니다. 새 배치로 다시 시작합니다.`);
  };

  const undoShot = () => {
    if (isMoving || historyRef.current.length === 0) return;
    const prev = historyRef.current.pop();
    syncStones(prev.stones.map((stone) => ({ ...stone })));
    syncTurn(prev.turn);
    setWinner(null);
    setSelectedId(null);
    setAim(null);
    setMessage("직전 턴을 되돌렸습니다.");
  };

  const getBoardPoint = (event, clampToGoban = true) => {
    const rect = boardRef.current.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };

    if (!clampToGoban) return point;

    return {
      x: clamp(point.x, GOBAN_MIN, GOBAN_MAX),
      y: clamp(point.y, GOBAN_MIN, GOBAN_MAX),
    };
  };

  const capPullVector = (pullX, pullY) => {
    const pullPower = length(pullX, pullY);
    if (pullPower <= MAX_PULL_DISTANCE || pullPower === 0) {
      return { x: pullX, y: pullY, power: pullPower };
    }

    const scale = MAX_PULL_DISTANCE / pullPower;
    return {
      x: pullX * scale,
      y: pullY * scale,
      power: MAX_PULL_DISTANCE,
    };
  };

  const shootStone = (stoneId, pullX, pullY, actorLabel = teamName(turnRef.current)) => {
    const stone = stonesRef.current.find((item) => item.id === stoneId);
    if (!stone || !stone.alive || animatingRef.current) return false;

    const rawPullPower = length(pullX, pullY);
    if (rawPullPower < MIN_SHOT_POWER) return false;

    const cappedPull = capPullVector(pullX, pullY);

    historyRef.current.push({
      stones: stonesRef.current.map((item) => ({ ...item })),
      turn: turnRef.current,
    });
    if (historyRef.current.length > 10) historyRef.current.shift();

    const power = clamp(cappedPull.power * 8.5 * powerScale, 0, MAX_POWER);
    const next = stonesRef.current.map((item) => {
      if (item.id !== stoneId) return { ...item };
      return {
        ...item,
        vx: cappedPull.x * power,
        vy: cappedPull.y * power,
      };
    });

    lastShotTeamRef.current = turnRef.current;
    syncStones(next);
    setSelectedId(null);
    setAim(null);
    setIsMoving(true);
    setMessage(`${actorLabel}이 돌을 튕겼습니다. 모든 돌이 멈추면 턴이 넘어갑니다.`);
    startPhysics();
    return true;
  };

  const startDrag = (event, stone) => {
    if (!canHumanInteract || stone.team !== turn || !stone.alive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getBoardPoint(event, true);
    setSelectedId(stone.id);
    setAim({ startX: stone.x, startY: stone.y, pointerX: point.x, pointerY: point.y });
  };

  const moveDrag = (event) => {
    if (!selectedId || !aim || !canHumanInteract) return;
    const point = getBoardPoint(event, false);
    setAim((prev) => ({ ...prev, pointerX: point.x, pointerY: point.y }));
  };

  const endDrag = () => {
    if (!selectedId || !aim || !canHumanInteract) {
      setSelectedId(null);
      setAim(null);
      return;
    }

    const stone = stonesRef.current.find((item) => item.id === selectedId);
    if (!stone || !stone.alive) return;

    const pullX = aim.startX - aim.pointerX;
    const pullY = aim.startY - aim.pointerY;
    const success = shootStone(selectedId, pullX, pullY, modeRef.current === "ai" ? `플레이어 ${teamName(turnRef.current)}` : teamName(turnRef.current));

    if (!success) {
      setSelectedId(null);
      setAim(null);
      setMessage("너무 약합니다. 조금 더 당겨서 튕겨보세요.");
    }
  };

  const chooseAiShot = () => {
    const aiTeamNow = oppositeTeam(playerTeamRef.current);
    const enemyTeamNow = playerTeamRef.current;
    const all = stonesRef.current.filter((stone) => stone.alive);
    const aiStones = all.filter((stone) => stone.team === aiTeamNow);
    const enemyStones = all.filter((stone) => stone.team === enemyTeamNow);
    if (aiStones.length === 0 || enemyStones.length === 0) return null;

    const difficultyValue = difficultyRef.current;
    const randomness = difficultyValue === "easy" ? 0.34 : difficultyValue === "hard" ? 0.06 : 0.16;
    const accuracy = difficultyValue === "easy" ? 0.15 : difficultyValue === "hard" ? 0.035 : 0.075;
    const forceBonus = difficultyValue === "easy" ? 0.92 : difficultyValue === "hard" ? 1.18 : 1.04;
    const edgeBlend = difficultyValue === "easy" ? 0.04 : difficultyValue === "hard" ? 0.20 : 0.12;

    let best = null;

    for (const own of aiStones) {
      for (const target of enemyStones) {
        const d = distance(own, target);
        const shotDir = normalize(target.x - own.x, target.y - own.y);
        const exit = nearestExitVector(target);
        const alignment = shotDir.x * exit.x + shotDir.y * exit.y;
        const targetDanger = edgeDanger(target);
        const selfDanger = edgeDanger(own);

        const score =
          d * 0.9 -
          targetDanger * 0.22 -
          Math.max(alignment, 0) * 0.16 +
          selfDanger * 0.05 +
          Math.random() * randomness;

        if (!best || score < best.score) {
          best = { own, target, d, alignment, targetDanger, selfDanger, exit, score };
        }
      }
    }

    if (!best) return null;

    const direct = normalize(best.target.x - best.own.x, best.target.y - best.own.y);
    const exitAssist = Math.max(best.alignment, 0) > 0.15 ? edgeBlend : edgeBlend * 0.35;
    let aimDir = normalize(
      direct.x * (1 - exitAssist) + best.exit.x * exitAssist,
      direct.y * (1 - exitAssist) + best.exit.y * exitAssist
    );

    const missAngle = (Math.random() - 0.5) * accuracy;
    const cos = Math.cos(missAngle);
    const sin = Math.sin(missAngle);
    aimDir = {
      x: aimDir.x * cos - aimDir.y * sin,
      y: aimDir.x * sin + aimDir.y * cos,
    };

    const targetNearEdge = best.targetDanger;
    const needsCenterPower = 1 - targetNearEdge;
    const alignmentPowerAdjust = best.alignment > 0.55 ? 0.86 : best.alignment < -0.15 ? 1.18 : 1.0;
    const selfRiskAdjust = best.selfDanger > 0.7 ? 0.88 : 1.0;

    const basePull = clamp(
      (0.14 + best.d * 0.34 + needsCenterPower * 0.09) * forceBonus * alignmentPowerAdjust * selfRiskAdjust,
      0.13,
      MAX_PULL_DISTANCE
    );

    return {
      stoneId: best.own.id,
      pullX: aimDir.x * basePull,
      pullY: aimDir.y * basePull,
    };
  };

  const playAiTurn = () => {
    const aiTeamNow = oppositeTeam(playerTeamRef.current);
    if (modeRef.current !== "ai" || turnRef.current !== aiTeamNow || animatingRef.current || winner) return;
    const shot = chooseAiShot();
    if (!shot) return;
    shootStone(shot.stoneId, shot.pullX, shot.pullY, `AI ${teamName(aiTeamNow)}`);
  };

  const checkWinner = (nextStones) => {
    const blackAlive = nextStones.some((stone) => stone.alive && stone.team === "black");
    const whiteAlive = nextStones.some((stone) => stone.alive && stone.team === "white");

    if (!blackAlive && !whiteAlive) return "draw";
    if (!blackAlive) return "white";
    if (!whiteAlive) return "black";
    return null;
  };

  const winnerTitle = (winnerTeam) => {
    if (winnerTeam === "draw") return "무승부!";
    if (mode === "ai") {
      return winnerTeam === playerTeam ? "플레이어 승리!" : "AI 승리!";
    }
    return `${teamName(winnerTeam)} 승리!`;
  };

  const startPhysics = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    let last = performance.now();

    const step = (now) => {
      const dt = clamp((now - last) / 16.67, 0.5, 2.2);
      last = now;

      const next = stonesRef.current.map((stone) => ({ ...stone }));

      for (const stone of next) {
        if (!stone.alive) continue;
        stone.x += stone.vx * 0.008 * dt;
        stone.y += stone.vy * 0.008 * dt;
        stone.vx *= Math.pow(FRICTION, dt);
        stone.vy *= Math.pow(FRICTION, dt);

        if (length(stone.vx, stone.vy) < STOP_SPEED) {
          stone.vx = 0;
          stone.vy = 0;
        }

        if (
          stone.x < BOARD_PADDING - RADIUS ||
          stone.x > 1 - BOARD_PADDING + RADIUS ||
          stone.y < BOARD_PADDING - RADIUS ||
          stone.y > 1 - BOARD_PADDING + RADIUS
        ) {
          stone.alive = false;
          stone.vx = 0;
          stone.vy = 0;
        }
      }

      for (let i = 0; i < next.length; i++) {
        for (let j = i + 1; j < next.length; j++) {
          const a = next[i];
          const b = next[j];
          if (!a.alive || !b.alive) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(length(dx, dy), 0.0001);
          const minDist = RADIUS * 2;

          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;

            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;

            const relVx = b.vx - a.vx;
            const relVy = b.vy - a.vy;
            const speedAlongNormal = relVx * nx + relVy * ny;

            if (speedAlongNormal < 0) {
              const impulse = -speedAlongNormal * 0.96;
              a.vx -= impulse * nx;
              a.vy -= impulse * ny;
              b.vx += impulse * nx;
              b.vy += impulse * ny;
            }
          }
        }
      }

      const currentWinner = checkWinner(next);
      const stillMoving = next.some((stone) => stone.alive && length(stone.vx, stone.vy) > 0);

      syncStones(next);

      if (currentWinner) {
        animatingRef.current = false;
        setIsMoving(false);
        setWinner(currentWinner);
        if (currentWinner === "draw") {
          setMessage("동시에 모든 돌이 떨어졌습니다. 무승부입니다!");
        } else if (modeRef.current === "ai") {
          const playerTeamNow = playerTeamRef.current;
          setMessage(
            currentWinner === playerTeamNow
              ? `플레이어 승리! AI의 ${teamName(oppositeTeam(playerTeamNow))}을 모두 장외로 밀어냈습니다.`
              : `AI 승리! 플레이어의 ${teamName(playerTeamNow)}이 모두 장외로 밀려났습니다.`
          );
        } else {
          setMessage(`${teamName(currentWinner)} 승리! 상대 돌을 모두 장외로 밀어냈습니다.`);
        }
        return;
      }

      if (!stillMoving) {
        animatingRef.current = false;
        setIsMoving(false);
        const nextTurn = oppositeTeam(lastShotTeamRef.current || turnRef.current);
        syncTurn(nextTurn);

        if (modeRef.current === "ai" && nextTurn === oppositeTeam(playerTeamRef.current)) {
          setMessage("AI가 상황을 보고 파워를 조절하고 있습니다...");
        } else if (modeRef.current === "ai") {
          setMessage(`플레이어 ${teamName(nextTurn)} 차례입니다. 내 돌을 당겨서 튕기세요.`);
        } else {
          setMessage(`${teamName(nextTurn)} 차례입니다. 내 돌을 당겨서 튕기세요.`);
        }
        return;
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    playerTeamRef.current = playerTeam;
  }, [playerTeam]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    stonesPerTeamRef.current = stonesPerTeam;
  }, [stonesPerTeam]);

  useEffect(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

    if (mode === "ai" && turn === oppositeTeam(playerTeam) && !isMoving && !winner) {
      aiTimerRef.current = setTimeout(() => {
        playAiTurn();
      }, 750);
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [mode, turn, playerTeam, isMoving, winner, stones]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      stopPowerHold();
    };
  }, []);

  const selectedStone = stones.find((stone) => stone.id === selectedId);
  const aimVector = aim && selectedStone
    ? {
        dx: aim.startX - aim.pointerX,
        dy: aim.startY - aim.pointerY,
        power: clamp(length(aim.startX - aim.pointerX, aim.startY - aim.pointerY), 0, MAX_PULL_DISTANCE),
      }
    : null;

  const turnLabel = mode === "ai"
    ? turn === aiTeam
      ? `AI ${teamName(turn)}`
      : `플레이어 ${teamName(turn)}`
    : teamName(turn);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-7xl grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-3xl bg-neutral-900/80 shadow-2xl border border-neutral-800 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">알까기</h1>
              <p className="text-sm text-neutral-400 mt-1">내 돌을 당겼다가 놓아 상대 돌을 판 밖으로 밀어내세요.</p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl bg-neutral-800 px-3 py-2">
              <span className="text-xs text-neutral-400">현재 턴</span>
              <span className={`font-bold ${turn === "black" ? "text-neutral-100" : "text-amber-100"}`}>
                {turnLabel}
              </span>
            </div>
          </div>

          <div
            ref={boardRef}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative mx-auto aspect-square w-full max-w-[900px] select-none overflow-hidden rounded-[1.4rem] border-[12px] border-[#6b4423] bg-[#8b5a2b] shadow-inner touch-none"
          >
            <div className="absolute inset-[8%] rounded-3xl bg-[#d8b46a] border-4 border-[#6b4423]" />

            {Array.from({ length: 19 }).map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute bg-[#5c3a1f]/70"
                style={{
                  left: `${8 + (84 / 18) * i}%`,
                  top: "8%",
                  width: "1px",
                  height: "84%",
                }}
              />
            ))}

            {Array.from({ length: 19 }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute bg-[#5c3a1f]/70"
                style={{
                  top: `${8 + (84 / 18) * i}%`,
                  left: "8%",
                  height: "1px",
                  width: "84%",
                }}
              />
            ))}

            {[
              [4, 4], [10, 4], [16, 4],
              [4, 10], [10, 10], [16, 10],
              [4, 16], [10, 16], [16, 16],
            ].map(([gx, gy], idx) => (
              <div
                key={`dot-${idx}`}
                className="absolute rounded-full bg-[#4b2d18]"
                style={{
                  left: `${8 + (84 / 18) * gx}%`,
                  top: `${8 + (84 / 18) * gy}%`,
                  width: "0.8%",
                  height: "0.8%",
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}

            {aimVector && selectedStone && (
              <>
                <div
                  className="absolute z-20 h-1 origin-left rounded-full bg-sky-300/80 shadow-[0_0_18px_rgba(125,211,252,0.9)]"
                  style={{
                    left: `${selectedStone.x * 100}%`,
                    top: `${selectedStone.y * 100}%`,
                    width: `${Math.max((aimVector.power / MAX_PULL_DISTANCE) * 70, 22)}%`,
                    transform: `rotate(${Math.atan2(aimVector.dy, aimVector.dx)}rad)`,
                  }}
                />
                <div
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-200/70 bg-sky-300/20"
                  style={{
                    left: `${aim.pointerX * 100}%`,
                    top: `${aim.pointerY * 100}%`,
                    width: "7%",
                    height: "7%",
                  }}
                />
              </>
            )}

            {stones.filter((stone) => stone.alive).map((stone) => {
              const isSelected = stone.id === selectedId;
              const isMyTurn = stone.team === turn && canHumanInteract;

              return (
                <button
                  key={stone.id}
                  onPointerDown={(event) => startDrag(event, stone)}
                  className={`absolute z-30 flex items-center justify-center rounded-full transition-transform duration-75 ${
                    isMyTurn ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                  } ${isSelected ? "scale-110 ring-4 ring-sky-300" : ""}`}
                  style={{
                    left: `${stone.x * 100}%`,
                    top: `${stone.y * 100}%`,
                    width: `${RADIUS * 200}%`,
                    height: `${RADIUS * 200}%`,
                    transform: `translate(-50%, -50%) ${isSelected ? "scale(1.08)" : "scale(1)"}`,
                  }}
                  aria-label={`${teamName(stone.team)} ${stone.label}`}
                >
                  <span
                    className={`absolute inset-0 rounded-full shadow-lg ${
                      stone.team === "black"
                        ? "bg-[radial-gradient(circle_at_35%_28%,#666,#111_52%,#000)] border border-neutral-700"
                        : "bg-[radial-gradient(circle_at_35%_28%,#ffffff,#ececec_55%,#cfcfcf)] border border-neutral-300"
                    }`}
                  />
                </button>
              );
            })}

            {isAiTurn && !winner && (
              <div className="absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-full bg-neutral-950/80 border border-amber-300/40 px-4 py-2 text-sm font-bold text-amber-200 shadow-xl">
                AI 판단 중...
              </div>
            )}

            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-6">
                <div className="rounded-3xl bg-neutral-950 border border-neutral-700 p-6 text-center shadow-2xl max-w-sm">
                  <div className="text-4xl mb-3">🏆</div>
                  <h2 className="text-2xl font-black mb-2">{winnerTitle(winner)}</h2>
                  <p className="text-sm text-neutral-400 mb-5">다시 시작해서 한 판 더 해보세요.</p>
                  <button onClick={() => resetGame()} className="rounded-2xl bg-amber-400 px-5 py-3 font-black text-neutral-950 hover:bg-amber-300 transition">
                    새 게임
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="rounded-3xl bg-neutral-900/80 shadow-2xl border border-neutral-800 p-5 flex flex-col gap-4">
          <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400 mb-2">게임 모드</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => changeMode("pvp")}
                className={`rounded-2xl px-3 py-3 font-black transition ${mode === "pvp" ? "bg-amber-400 text-neutral-950" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
              >
                2인 대전
              </button>
              <button
                onClick={() => changeMode("ai")}
                className={`rounded-2xl px-3 py-3 font-black transition ${mode === "ai" ? "bg-amber-400 text-neutral-950" : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
              >
                AI 대전
              </button>
            </div>

            {mode === "ai" && (
              <>
                <div className="mt-3 rounded-2xl bg-neutral-900 border border-neutral-800 p-3">
                  <div className="text-xs text-neutral-400 mb-2">내 돌 선택</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => changePlayerTeam("black")}
                      disabled={isMoving}
                      className={`rounded-xl px-2 py-2 text-sm font-black transition disabled:opacity-40 ${playerTeam === "black" ? "bg-neutral-100 text-neutral-950" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"}`}
                    >
                      흑돌
                    </button>
                    <button
                      onClick={() => changePlayerTeam("white")}
                      disabled={isMoving}
                      className={`rounded-xl px-2 py-2 text-sm font-black transition disabled:opacity-40 ${playerTeam === "white" ? "bg-amber-200 text-neutral-950" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"}`}
                    >
                      백돌
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ["easy", "쉬움"],
                    ["normal", "보통"],
                    ["hard", "어려움"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => changeDifficulty(value)}
                      className={`rounded-xl px-2 py-2 text-sm font-bold transition ${difficulty === value ? "bg-sky-400 text-neutral-950" : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <div className="text-sm text-neutral-400">돌 개수</div>
                <div className="text-lg font-black">팀당 {stonesPerTeam}개</div>
              </div>
              <div className="text-xs text-neutral-500 text-right">변경 시<br />새 게임</div>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {STONE_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  onClick={() => changeStoneCount(count)}
                  disabled={isMoving}
                  className={`rounded-xl px-2 py-2 text-sm font-black transition disabled:opacity-40 ${stonesPerTeam === count ? "bg-amber-400 text-neutral-950" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"}`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
            <div className="text-sm text-neutral-400 mb-2">상태</div>
            <p className="font-semibold leading-relaxed">{message}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
              <div className="text-xs text-neutral-400">흑돌</div>
              <div className="text-3xl font-black mt-1">{counts.black}</div>
              {mode === "ai" && <div className="text-xs text-sky-300 mt-1">{sideRoleLabel("black", playerTeam, mode)}</div>}
            </div>
            <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
              <div className="text-xs text-neutral-400">백돌</div>
              <div className="text-3xl font-black mt-1">{counts.white}</div>
              {mode === "ai" && <div className="text-xs text-amber-300 mt-1">{sideRoleLabel("white", playerTeam, mode)}</div>}
            </div>
          </div>

          <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4">
            <label className="flex items-center justify-between gap-3 text-sm font-bold">
              <span>튕김 세기</span>
              <span className="text-amber-300">{Math.round(powerScale * 100)}%</span>
            </label>

            <div className="mt-3 grid grid-cols-[44px_1fr_44px] items-center gap-2">
              <button
                type="button"
                onPointerDown={(event) => { event.preventDefault(); startPowerHold(-0.05); }}
                onPointerUp={stopPowerHold}
                onPointerLeave={stopPowerHold}
                onPointerCancel={stopPowerHold}
                className="h-11 rounded-xl bg-neutral-800 text-xl font-black hover:bg-neutral-700 active:bg-neutral-600"
              >
                −
              </button>

              <input
                type="range"
                min="0.6"
                max="3"
                step="0.05"
                value={powerScale}
                onInput={(event) => setPowerScale(Number(event.currentTarget.value))}
                onChange={(event) => setPowerScale(Number(event.currentTarget.value))}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerMove={(event) => event.stopPropagation()}
                className="w-full accent-amber-400 touch-auto cursor-pointer"
              />

              <button
                type="button"
                onPointerDown={(event) => { event.preventDefault(); startPowerHold(0.05); }}
                onPointerUp={stopPowerHold}
                onPointerLeave={stopPowerHold}
                onPointerCancel={stopPowerHold}
                className="h-11 rounded-xl bg-neutral-800 text-xl font-black hover:bg-neutral-700 active:bg-neutral-600"
              >
                +
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => resetGame()} className="rounded-2xl bg-amber-400 px-4 py-3 font-black text-neutral-950 hover:bg-amber-300 transition">새 게임</button>
            <button
              onClick={undoShot}
              disabled={isMoving || historyRef.current.length === 0}
              className="rounded-2xl bg-neutral-800 px-4 py-3 font-black text-neutral-100 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 transition"
            >
              한 수 무르기
            </button>
          </div>

          <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-4 text-sm text-neutral-300 leading-relaxed">
            <h3 className="font-black text-neutral-100 mb-2">조작법</h3>
            <p>1. 현재 턴의 돌을 누릅니다.</p>
            <p>2. 보내고 싶은 방향의 반대쪽으로 당깁니다.</p>
            <p>3. 손을 놓으면 돌이 튕겨 나갑니다.</p>
            <p className="mt-2 text-neutral-500">AI 대전에서는 내 돌을 흑돌/백돌 중에서 고를 수 있습니다.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AlkkagiGame />);
