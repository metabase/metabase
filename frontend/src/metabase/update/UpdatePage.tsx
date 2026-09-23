import "@fontsource/press-start-2p/400.css";

import { useEffect, useState } from "react";
import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useUpgradeStatus } from "metabase/status/hooks/self-upgrade";

import { KonamiArrowSprite } from "./GameSprites";
import { GameUpgradeStatus } from "./GameUpgradeStatus";
import { ShinyInvadersPage } from "./ShinyInvadersPage";
import { UpdateMusic } from "./UpdateMusic";
import S from "./UpdatePage.module.css";
import { UpgradeCompletion } from "./UpgradeCompletion";
import { UpgradeProgress, getUpdateHeading } from "./UpgradeProgress";

const KONAMI_CODE = [
  { code: "ArrowUp", symbol: "↑", direction: "up" },
  { code: "ArrowUp", symbol: "↑", direction: "up" },
  { code: "ArrowDown", symbol: "↓", direction: "down" },
  { code: "ArrowDown", symbol: "↓", direction: "down" },
  { code: "ArrowLeft", symbol: "←", direction: "left" },
  { code: "ArrowRight", symbol: "→", direction: "right" },
  { code: "ArrowLeft", symbol: "←", direction: "left" },
  { code: "ArrowRight", symbol: "→", direction: "right" },
  { code: "KeyB", symbol: "B" },
  { code: "KeyA", symbol: "A" },
] as const;
const GAME_REVEAL_DELAY_MS = 350;

export function UpdatePage() {
  const status = useUpgradeStatus();
  const [sequence, setSequence] = useState({ progress: 0, attempt: 0 });
  const [screen, setScreen] = useState<"code" | "ready" | "playing">("code");
  const isGameRevealed = screen !== "code";
  const isCodeComplete = sequence.progress === KONAMI_CODE.length;

  useEffect(() => {
    if (isCodeComplete) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.isComposing ||
        event.key === "Shift" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (KONAMI_CODE.some(({ code }) => code === event.code)) {
        event.preventDefault();
      }

      setSequence((current) => {
        if (current.progress === KONAMI_CODE.length) {
          return current;
        }
        if (event.code === KONAMI_CODE[current.progress]?.code) {
          return { ...current, progress: current.progress + 1 };
        }
        return {
          progress: event.code === KONAMI_CODE[0].code ? 1 : 0,
          attempt: current.attempt + 1,
        };
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCodeComplete]);

  useEffect(() => {
    if (!isCodeComplete) {
      return;
    }
    const timeout = window.setTimeout(
      () => setScreen("ready"),
      GAME_REVEAL_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [isCodeComplete]);

  useEffect(() => {
    if (screen !== "ready") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isUsingControl =
        target instanceof HTMLElement &&
        (target.closest("button, a, input, textarea, select") ||
          target.isContentEditable);
      if (
        !isUsingControl &&
        event.code === "Space" &&
        !event.repeat &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        setScreen("playing");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen]);

  return (
    <div className={S.page} data-game-revealed={isGameRevealed}>
      {screen !== "playing" && <UpdateMusic />}
      <main className={S.loading} aria-hidden={isGameRevealed}>
        <header className={S.message}>
          <LogoIcon height={56} />
          <h1>{getUpdateHeading(status.phase)}</h1>
          <UpgradeProgress status={status} />
          {!isGameRevealed && <UpgradeCompletion status={status} />}
          <p>{t`Enter KONAMI code if you're bored`}</p>
        </header>
        <div className={S.symbols} role="status" aria-label={t`Konami code`}>
          {KONAMI_CODE.slice(0, sequence.progress).map((entry, index) => (
            <span
              className={S.symbol}
              key={`${sequence.attempt}-${index}`}
              role="img"
              aria-label={entry.symbol}
            >
              {"direction" in entry ? (
                <KonamiArrowSprite direction={entry.direction} />
              ) : (
                entry.symbol
              )}
            </span>
          ))}
        </div>
      </main>
      {screen === "ready" && (
        <main className={S.ready}>
          <div className={S.readyStatus}>
            <GameUpgradeStatus status={status} />
          </div>
          <h2>{t`PRESS SPACE`}</h2>
        </main>
      )}
      {screen === "playing" && (
        <div className={S.gameReveal}>
          <ShinyInvadersPage header={<GameUpgradeStatus status={status} />} />
        </div>
      )}
    </div>
  );
}
