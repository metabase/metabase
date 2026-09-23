import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

import S from "./UpdateMusic.module.css";

const MUSIC_TRACKS = {
  elevator: "app/assets/audio/local-forecast-elevator.mp3",
  game: "app/assets/audio/space-invaders-march.wav",
} as const;

export function UpdateMusic({
  track,
  paused = false,
  playbackRate = 1,
}: {
  track: keyof typeof MUSIC_TRACKS;
  paused?: boolean;
  playbackRate?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(true);
  const [playback, setPlayback] = useState<
    "paused" | "playing" | "unavailable"
  >("paused");

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (paused || !audio || !audio.paused || audio.error) {
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
  }, [paused]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      // Some browsers mute audio above 4×; retain the original note pitches.
      audio.playbackRate = Math.min(playbackRate, 4);
      audio.preservesPitch = true;
    }
  }, [playbackRate, track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.volume = 0.2;
    if (!enabled || paused) {
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
  }, [enabled, paused, track, tryPlay]);

  const isMusicOn = enabled && (playback === "playing" || paused);
  const togglePlayback = () => {
    if (isMusicOn) {
      setEnabled(false);
    } else {
      setEnabled(true);
      tryPlay();
    }
  };

  const controlLabel =
    playback === "unavailable"
      ? t`Music unavailable`
      : isMusicOn
        ? t`Mute music`
        : t`Play music`;

  return (
    <div className={S.music} ref={controlsRef}>
      <audio
        key={track}
        ref={audioRef}
        src={MUSIC_TRACKS[track]}
        autoPlay={enabled && !paused}
        loop
        preload="auto"
        onCanPlay={() => {
          if (enabled) {
            tryPlay();
          }
        }}
        onLoadStart={() => setPlayback("paused")}
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
          c="text-primary"
          aria-label={controlLabel}
          disabled={playback === "unavailable"}
          onClick={togglePlayback}
        >
          <Icon
            name={
              playback === "unavailable"
                ? "warning"
                : isMusicOn
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
