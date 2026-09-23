import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import S from "./UpdateMusic.module.css";

export function UpdateMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [playback, setPlayback] = useState<
    "paused" | "playing" | "unavailable"
  >("paused");

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.paused || audio.error) {
      return;
    }
    void audio.play().catch((error: unknown) => {
      if (!audio.isConnected) {
        return;
      }
      // Autoplay denial can be retried on a gesture; pause/unmount can abort play.
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "AbortError")
      ) {
        return;
      }
      setPlayback("unavailable");
    });
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = 0.2;
    if (!enabled) {
      audio.pause();
      return;
    }

    tryPlay();
    const handleGesture = (event: Event) => {
      // The music button owns its click; don't start and then immediately mute it.
      if (
        event.target instanceof Node &&
        controlsRef.current?.contains(event.target)
      ) {
        return;
      }
      tryPlay();
    };
    window.addEventListener("keydown", handleGesture);
    window.addEventListener("click", handleGesture);
    return () => {
      window.removeEventListener("keydown", handleGesture);
      window.removeEventListener("click", handleGesture);
      audio.pause();
    };
  }, [enabled, tryPlay]);

  const togglePlayback = () => {
    if (playback === "playing") {
      setEnabled(false);
    } else {
      setEnabled(true);
      tryPlay();
    }
  };

  const controlLabel =
    playback === "unavailable"
      ? t`Music unavailable`
      : playback === "playing"
        ? t`Mute music`
        : t`Play music`;

  return (
    <div className={S.music} ref={controlsRef}>
      <audio
        ref={audioRef}
        src="app/assets/audio/local-forecast-elevator.mp3"
        autoPlay={enabled}
        loop
        preload="auto"
        onCanPlay={() => {
          if (enabled) {
            tryPlay();
          }
        }}
        onPlaying={() => setPlayback("playing")}
        onPause={() =>
          setPlayback((current) =>
            current === "unavailable" ? current : "paused",
          )
        }
        onError={() => setPlayback("unavailable")}
      />
      <Tooltip label={controlLabel} position="top-end">
        <ActionIcon
          type="button"
          size="lg"
          variant="subtle"
          c="text-primary-inverse"
          aria-label={controlLabel}
          disabled={playback === "unavailable"}
          onClick={togglePlayback}
        >
          <Icon
            name={
              playback === "unavailable"
                ? "warning"
                : playback === "playing"
                  ? "pause"
                  : "play"
            }
            size={20}
          />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}
