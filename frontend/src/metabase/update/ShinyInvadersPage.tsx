import { useEffect, useRef, useState } from "react";
import { useInterval } from "react-use";
import { t } from "ttag";

import { Button, useElementSize } from "metabase/ui";

import { INVADER_SPRITES, MetabotShipSprite } from "./GameSprites";
import S from "./ShinyInvadersPage.module.css";

const TICK_MS = 30;
const HIGH_SCORE_DELAY_MS = 2000;
const PLAYER_Y = 84;
const PLAYER_WIDTH = 10;
const PLAYER_STEP = 1.2;
const SHOT_STEP = 2.4;
const INVADER_STEP = 0.18 * 1.5;
const INVADER_DROP = 5;
const INVADER_WIDTH = 7;
const MAX_SHOTS = 4;

interface Position {
  id: number;
  x: number;
  y: number;
}

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpriteBounds {
  playerWidth: number;
  playerHeight: number;
  invaderHeight: number;
}

interface HighScore {
  name: string;
  score: number;
  isCurrentPlayer?: boolean;
}

type GameStatus = "playing" | "won" | "lost" | "high-scores";
const DEFAULT_HIGH_SCORES: readonly HighScore[] = [
  { name: "SASHA", score: 9000 },
  { name: "ALEX P", score: 8000 },
  { name: "TIMOTHY", score: 7000 },
  { name: "BRYAN", score: 6000 },
  { name: "DAN", score: 5000 },
  { name: "ARIK", score: 4000 },
  { name: "VAMSI", score: 100 },
];

interface GameState {
  playerX: number;
  invaders: Position[];
  shots: Position[];
  invaderDirection: -1 | 1;
  nextShotId: number;
  score: number;
  stage: number;
  status: GameStatus;
}

const createInvaders = (): Position[] =>
  Array.from({ length: 15 }, (_, index) => ({
    id: index,
    x: 17 + (index % 5) * 14,
    y: 12 + Math.floor(index / 5) * 14,
  }));

const createGame = (stage = 1, score = 0): GameState => ({
  playerX: 46,
  invaders: createInvaders(),
  shots: [],
  invaderDirection: 1,
  nextShotId: 1,
  score,
  stage,
  status: "playing",
});

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const rectanglesOverlap = (first: Rectangle, second: Rectangle) =>
  first.x <= second.x + second.width &&
  first.x + first.width >= second.x &&
  first.y <= second.y + second.height &&
  first.y + first.height >= second.y;

const advanceGame = (
  state: GameState,
  movement: number,
  bounds: SpriteBounds,
): GameState => {
  if (state.status !== "playing") {
    return state;
  }

  const playerX = clamp(
    state.playerX + movement * PLAYER_STEP,
    1,
    99 - bounds.playerWidth,
  );
  const invaderStep = INVADER_STEP * 1.4 ** (state.stage - 1);
  const edgeReached = state.invaders.some(({ x }) => {
    const nextX = x + state.invaderDirection * invaderStep;
    return nextX < 2 || nextX + INVADER_WIDTH > 98;
  });
  const invaderDirection = edgeReached
    ? state.invaderDirection === 1
      ? -1
      : 1
    : state.invaderDirection;
  const invaders = state.invaders.map((invader) => ({
    ...invader,
    x: edgeReached ? invader.x : invader.x + invaderDirection * invaderStep,
    y: edgeReached ? invader.y + INVADER_DROP : invader.y,
  }));
  const hitInvaderIds = new Set<number>();
  const shots = state.shots
    .map((shot) => ({ ...shot, y: shot.y - SHOT_STEP }))
    .filter((shot) => {
      if (shot.y < 0) {
        return false;
      }

      const hitInvader = invaders.find(
        (invader) =>
          !hitInvaderIds.has(invader.id) &&
          shot.x >= invader.x &&
          shot.x <= invader.x + INVADER_WIDTH &&
          shot.y >= invader.y &&
          shot.y <= invader.y + bounds.invaderHeight,
      );

      if (hitInvader) {
        hitInvaderIds.add(hitInvader.id);
        return false;
      }

      return true;
    });
  const remainingInvaders = invaders.filter(({ id }) => !hitInvaderIds.has(id));
  const invaderHitShip = remainingInvaders.some(({ x, y }) =>
    rectanglesOverlap(
      { x, y, width: INVADER_WIDTH, height: bounds.invaderHeight },
      {
        x: playerX,
        y: PLAYER_Y,
        width: bounds.playerWidth,
        height: bounds.playerHeight,
      },
    ),
  );
  const invaderReachedBottom = remainingInvaders.some(
    ({ y }) => y + bounds.invaderHeight >= 100,
  );
  const status =
    remainingInvaders.length === 0
      ? "won"
      : invaderHitShip || invaderReachedBottom
        ? "lost"
        : "playing";

  return {
    ...state,
    playerX,
    invaders: remainingInvaders,
    shots,
    invaderDirection,
    score: state.score + hitInvaderIds.size * 100,
    status,
  };
};

const continueGame = (state: GameState): GameState => {
  if (state.status === "won") {
    return createGame(state.stage + 1, state.score);
  }
  if (state.status === "high-scores") {
    return createGame();
  }
  return state;
};

const fire = (state: GameState): GameState => {
  if (state.status !== "playing" || state.shots.length >= MAX_SHOTS) {
    return state;
  }

  return {
    ...state,
    nextShotId: state.nextShotId + 1,
    shots: [
      ...state.shots,
      { id: state.nextShotId, x: state.playerX + 5, y: PLAYER_Y - 3 },
    ],
  };
};

export function ShinyInvadersPage() {
  const [game, setGame] = useState(createGame);
  const [playerName, setPlayerName] = useState("");
  const pressedKeys = useRef(new Set<string>());
  const {
    ref: boardRef,
    width: boardWidth,
    height: boardHeight,
  } = useElementSize();
  const {
    ref: shipRef,
    width: shipWidth,
    height: shipHeight,
  } = useElementSize();
  const hasSpriteMeasurements =
    boardWidth > 0 && boardHeight > 0 && shipWidth > 0 && shipHeight > 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEnteringName =
        target instanceof HTMLElement &&
        (target.matches("input, textarea") || target.isContentEditable);
      if (
        isEnteringName ||
        !["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "Space", "Enter"].includes(
          event.code,
        )
      ) {
        return;
      }

      event.preventDefault();
      pressedKeys.current.add(event.code);

      if (event.code === "Space" && !event.repeat) {
        setGame(fire);
      }
      if (event.code === "Enter") {
        setGame(continueGame);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.code);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (game.status !== "lost") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setGame((current) =>
        current.status === "lost"
          ? { ...current, status: "high-scores" }
          : current,
      );
    }, HIGH_SCORE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [game.status]);

  useInterval(
    () => {
      const movingLeft =
        pressedKeys.current.has("ArrowLeft") || pressedKeys.current.has("KeyA");
      const movingRight =
        pressedKeys.current.has("ArrowRight") ||
        pressedKeys.current.has("KeyD");
      const movement = Number(movingRight) - Number(movingLeft);
      // Width percentages and height percentages use different axes of the board.
      setGame((current) =>
        advanceGame(current, movement, {
          playerWidth: (shipWidth / boardWidth) * 100,
          playerHeight: (shipHeight / boardHeight) * 100,
          invaderHeight: (boardWidth * INVADER_WIDTH) / boardHeight,
        }),
      );
    },
    game.status === "playing" && hasSpriteMeasurements ? TICK_MS : null,
  );

  const statusMessage =
    game.status === "won"
      ? t`ALL HACKERS NEUTRALIZED`
      : game.status === "lost"
        ? t`THEY PWNED US!!!`
        : null;
  const showGameOver = game.status !== "playing";
  const showContinueButton =
    game.status === "won" || game.status === "high-scores";
  const highScores: HighScore[] = [
    {
      name: playerName.trim(),
      score: game.score,
      isCurrentPlayer: true,
    },
    ...DEFAULT_HIGH_SCORES,
  ].sort((first, second) => second.score - first.score);

  return (
    <main className={S.page}>
      <div className={S.updateMessage}>
        <div className={S.updateHeading}>
          <h1>{t`Update in progress…`}</h1>
          <div className={S.spinner} aria-hidden="true" />
        </div>
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- The update screen intentionally names the product being restarted. */}
        <p>{t`Metabase will be back shortly.`}</p>
      </div>

      <section className={S.game} aria-label={t`SHINY INVADERS`}>
        <header className={S.gameHeader}>
          <h2>{t`SHINY INVADERS`}</h2>
          <div className={S.gameStats}>
            <strong>{t`Stage: ${game.stage}`}</strong>
            <strong>{t`Score: ${game.score}`}</strong>
          </div>
        </header>

        <div className={S.board} ref={boardRef}>
          <div className={S.stars} aria-hidden="true" />
          {game.invaders.map((invader) => (
            <div
              className={S.invader}
              key={invader.id}
              style={{
                left: `${invader.x}%`,
                top: `${invader.y}%`,
                width: `${INVADER_WIDTH}%`,
              }}
            >
              {INVADER_SPRITES[invader.id % INVADER_SPRITES.length]}
            </div>
          ))}
          {game.shots.map((shot) => (
            <div
              className={S.shot}
              key={shot.id}
              style={{ left: `${shot.x}%`, top: `${shot.y}%` }}
            />
          ))}
          <div
            className={S.ship}
            ref={shipRef}
            style={{
              left: `${game.playerX}%`,
              top: `${PLAYER_Y}%`,
              width: `${PLAYER_WIDTH}%`,
            }}
          >
            <MetabotShipSprite />
          </div>

          {showGameOver && (
            <div className={S.gameOver}>
              {statusMessage && <h3>{statusMessage}</h3>}
              {game.status === "high-scores" && (
                <div className={S.highScores}>
                  <h3>{t`HIGH SCORES`}</h3>
                  <p>{t`YOUR SCORE: ${game.score}`}</p>
                  <table className={S.highScoreTable}>
                    <thead>
                      <tr>
                        <th>{t`RANK`}</th>
                        <th>{t`NAME`}</th>
                        <th>{t`SCORE`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highScores.map((record, index) => (
                        <tr
                          className={
                            record.isCurrentPlayer ? S.currentPlayer : undefined
                          }
                          key={`${record.name}-${index}`}
                        >
                          <td>{index + 1}</td>
                          <td>
                            {record.isCurrentPlayer ? (
                              <input
                                data-1p-ignore
                                aria-label={t`ENTER YOUR NAME`}
                                autoComplete="off"
                                autoFocus
                                maxLength={16}
                                value={playerName}
                                onChange={(event) =>
                                  setPlayerName(
                                    event.currentTarget.value.toUpperCase(),
                                  )
                                }
                              />
                            ) : (
                              record.name
                            )}
                          </td>
                          <td>{record.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {showContinueButton && (
                <Button variant="filled" onClick={() => setGame(continueGame)}>
                  {game.status === "won" ? t`NEXT STAGE` : t`TRY AGAIN`}
                </Button>
              )}
            </div>
          )}
        </div>

        <footer className={S.gameControls}>
          {t`Move with ← → or A D · Fire with Space`}
        </footer>
      </section>
    </main>
  );
}
