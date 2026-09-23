import "@fontsource/press-start-2p/400.css";

import { useEffect, useRef, useState } from "react";
import { useInterval } from "react-use";
import { t } from "ttag";

import { Button } from "metabase/ui";

import S from "./UpdatePage.module.css";

const TICK_MS = 30;
const HIGH_SCORE_DELAY_MS = 2000;
const PLAYER_Y = 84;
const PLAYER_WIDTH = 10;
const PLAYER_HEIGHT = 14;
const PLAYER_STEP = 1.2;
const SHOT_STEP = 2.4;
const INVADER_STEP = 0.18 * 1.3;
const INVADER_DROP = 5;
const INVADER_WIDTH = 7;
const INVADER_HEIGHT = 11;
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

interface HighScore {
  name: string;
  score: number;
  isCurrentPlayer?: boolean;
}

type GameStatus = "playing" | "won" | "lost" | "high-scores";
type PixelColor = "B" | "D" | "K" | "L" | "P" | "S" | "W" | "Y";

const METABOT_SHIP = [
  "          B          ",
  "         BBB         ",
  "        BBBBB        ",
  "       BBBBBBB       ",
  "      BBBBBBBBB      ",
  "     BBBBBBBBBBB     ",
  "   BBBWWWWWWWWWBBB   ",
  "  BBBBWLLLLLLLWBBBB  ",
  "  BBBBWLKLLLKLWBBBB  ",
  "  BBBBWLLLLLLLWBBBB  ",
  "  BBBBWLLKLLKLWBBBB  ",
  "  BBBBWLLLKKLLWBBBB  ",
  "  BBBBWWWWWWWWWBBBB  ",
  " BBBBBBBBBBBBBBBBBBB ",
  "BBBBBBBBBBBBBBBBBBBBB",
  "  BBBBB       BBBBB  ",
  " BBB             BBB ",
] as const;

const DEFAULT_HIGH_SCORES: readonly HighScore[] = [
  { name: "BRYAN", score: 9000 },
  { name: "ALEX P", score: 8000 },
  { name: "SASHA", score: 7000 },
  { name: "DAN", score: 6000 },
  { name: "ARIK", score: 5000 },
  { name: "VAMSI", score: 100 },
];

const HACKER_SPRITES = [
  [
    "  KKKKK  ",
    " KKKKKKK ",
    " KSSSSSK ",
    "SSKKKKKSS",
    "SKWKKKWKS",
    "SSKKKKKSS",
    " SSSSSSS ",
    "  SSSSS  ",
    "  K   K  ",
  ],
  [
    "  PPPPP  ",
    " PPPPPPP ",
    "PPDDDDDPP",
    "DDKKKKKDD",
    "DKWKKKWKD",
    "DDKKKKKDD",
    " DDDDDDD ",
    "  DDDDD  ",
    " P     P ",
  ],
  [
    " YY   YY ",
    "YKKYYYKKY",
    "YSSSSSSSY",
    "SSKKKKKSS",
    "SKWKKKWKS",
    "SSKKKKKSS",
    " SSSSSSS ",
    "  SSSSS  ",
    " B     B ",
  ],
] as const;

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

const PIXEL_CLASS_NAMES: Record<PixelColor, string> = {
  B: S.pixelBrand,
  D: S.pixelDarkSkin,
  K: S.pixelBlack,
  L: S.pixelLightBrand,
  P: S.pixelPurple,
  S: S.pixelSkin,
  W: S.pixelWhite,
  Y: S.pixelYellow,
};

const isPixelColor = (value: string): value is PixelColor =>
  value in PIXEL_CLASS_NAMES;

function PixelSprite({ pixels }: { pixels: readonly [string, ...string[]] }) {
  return (
    <span
      className={S.pixelSprite}
      aria-hidden="true"
      style={{
        gridTemplateColumns: `repeat(${pixels[0].length}, 1fr)`,
        gridTemplateRows: `repeat(${pixels.length}, 1fr)`,
      }}
    >
      {pixels.flatMap((row, rowIndex) =>
        Array.from(row).map((pixel, columnIndex) => {
          if (!isPixelColor(pixel)) {
            return null;
          }

          return (
            <span
              className={`${S.pixel} ${PIXEL_CLASS_NAMES[pixel]}`}
              key={`${rowIndex}-${columnIndex}`}
              style={{
                gridColumn: columnIndex + 1,
                gridRow: rowIndex + 1,
              }}
            />
          );
        }),
      )}
    </span>
  );
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
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const advanceGame = (state: GameState, movement: number): GameState => {
  if (state.status !== "playing") {
    return state;
  }

  const playerX = clamp(
    state.playerX + movement * PLAYER_STEP,
    1,
    99 - PLAYER_WIDTH,
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
          shot.y <= invader.y + INVADER_HEIGHT,
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
      { x, y, width: INVADER_WIDTH, height: INVADER_HEIGHT },
      {
        x: playerX,
        y: PLAYER_Y,
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
      },
    ),
  );
  const invaderReachedBottom = remainingInvaders.some(
    ({ y }) => y + INVADER_HEIGHT >= 100,
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

export function UpdatePage() {
  const [game, setGame] = useState(createGame);
  const [playerName, setPlayerName] = useState("");
  const pressedKeys = useRef(new Set<string>());

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
      setGame((current) => advanceGame(current, movement));
    },
    game.status === "playing" ? TICK_MS : null,
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
  const currentPlayerName = playerName.trim();
  const highScores: HighScore[] = [
    ...(currentPlayerName
      ? [
          {
            name: currentPlayerName,
            score: game.score,
            isCurrentPlayer: true,
          },
        ]
      : []),
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

        <div className={S.board}>
          <div className={S.stars} aria-hidden="true" />
          {game.invaders.map((invader) => (
            <div
              className={S.invader}
              key={invader.id}
              style={{ left: `${invader.x}%`, top: `${invader.y}%` }}
            >
              <PixelSprite
                pixels={HACKER_SPRITES[invader.id % HACKER_SPRITES.length]}
              />
            </div>
          ))}
          {game.shots.map((shot) => (
            <div
              className={S.shot}
              key={shot.id}
              style={{ left: `${shot.x}%`, top: `${shot.y}%` }}
            />
          ))}
          <div className={S.ship} style={{ left: `${game.playerX}%` }}>
            <PixelSprite pixels={METABOT_SHIP} />
          </div>

          {showGameOver && (
            <div className={S.gameOver}>
              {statusMessage && <h3>{statusMessage}</h3>}
              {game.status === "high-scores" && (
                <div className={S.highScores}>
                  <h3>{t`HIGH SCORES`}</h3>
                  <p>{t`YOUR SCORE: ${game.score}`}</p>
                  <label className={S.nameEntry}>
                    <span>{t`ENTER YOUR NAME`}</span>
                    <input
                      autoFocus
                      maxLength={16}
                      value={playerName}
                      onChange={(event) =>
                        setPlayerName(event.currentTarget.value.toUpperCase())
                      }
                    />
                  </label>
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
                          <td>{record.name}</td>
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
