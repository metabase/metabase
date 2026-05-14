import cx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WithRouterProps } from "react-router";
import { t } from "ttag";

import { skipToken, useGetSlidesQuery } from "metabase/api";
import { Editor } from "metabase/documents/components/Editor/Editor";
import { Box, Icon, Loader } from "metabase/ui";

import type { Slide } from "../../types";

import S from "./Presenter.module.css";

const isInteractiveTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof Element)) {
    return false;
  }
  return Boolean(
    el.closest("input, textarea, select, button, [contenteditable='true']"),
  );
};

type PresenterProps = WithRouterProps<{ entityId: string }>;

export const Presenter = ({ params, router }: PresenterProps) => {
  const numericId = Number(params.entityId);
  const { data: deck, isLoading } = useGetSlidesQuery(
    Number.isFinite(numericId) ? { id: numericId } : skipToken,
  );

  const [index, setIndex] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const slides: Slide[] = deck?.slides ?? [];
  const total = slides.length;

  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0))),
    [total],
  );
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const goFirst = useCallback(() => setIndex(0), []);
  const goLast = useCallback(
    () => setIndex(Math.max(total - 1, 0)),
    [total],
  );

  const exit = useCallback(() => {
    router.push(`/slides/${params.entityId}`);
  }, [router, params.entityId]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target)) {
        return;
      }
      switch (e.key) {
        case "ArrowRight":
        case " ":
        case "PageDown":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "Home":
          e.preventDefault();
          goFirst();
          break;
        case "End":
          e.preventDefault();
          goLast();
          break;
        case "Escape":
          e.preventDefault();
          exit();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, goFirst, goLast, exit, toggleFullscreen]);

  // Auto-hide HUD after inactivity
  useEffect(() => {
    const resetTimer = () => {
      setHudVisible(true);
      if (hideTimer.current != null) {
        window.clearTimeout(hideTimer.current);
      }
      hideTimer.current = window.setTimeout(() => setHudVisible(false), 2200);
    };
    resetTimer();
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    return () => {
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      if (hideTimer.current != null) {
        window.clearTimeout(hideTimer.current);
      }
    };
  }, []);

  if (isLoading || !deck) {
    return (
      <Box className={S.presenter}>
        <Loader />
      </Box>
    );
  }

  if (total === 0) {
    return (
      <Box className={S.presenter}>
        <span className={S.empty}>{t`This deck has no slides yet.`}</span>
      </Box>
    );
  }

  return (
    <Box className={S.presenter}>
      <button
        className={S.exit}
        onClick={exit}
        type="button"
        aria-label={t`Exit presentation`}
      >
        <Icon name="close" size={12} />
        {t`Esc`}
      </button>
      <Box className={S.viewport}>
        <Box
          className={S.track}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <PresenterStage key={slide.id} slide={slide} isActive={i === index} />
          ))}
        </Box>
      </Box>
      <Box className={cx(S.hud, { [S.hudHidden]: !hudVisible })}>
        <button
          type="button"
          onClick={goPrev}
          disabled={index === 0}
          aria-label={t`Previous`}
          style={{
            background: "none",
            border: 0,
            color: "inherit",
            cursor: "pointer",
            opacity: index === 0 ? 0.4 : 1,
          }}
        >
          <Icon name="chevronleft" size={14} />
        </button>
        <span className={S.counter}>
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={index >= total - 1}
          aria-label={t`Next`}
          style={{
            background: "none",
            border: 0,
            color: "inherit",
            cursor: "pointer",
            opacity: index >= total - 1 ? 0.4 : 1,
          }}
        >
          <Icon name="chevronright" size={14} />
        </button>
      </Box>
    </Box>
  );
};

const PresenterStage = ({
  slide,
  isActive,
}: {
  slide: Slide;
  isActive: boolean;
}) => {
  const stageClass =
    slide.layout === "cover"
      ? cx(S.stageContent, S.stageCover)
      : slide.layout === "closing"
        ? cx(S.stageContent, S.stageClosing)
        : S.stageContent;
  return (
    <Box className={S.stage} aria-hidden={!isActive}>
      <Box className={stageClass}>
        <Editor
          key={slide.id}
          initialContent={slide.doc}
          editable={false}
        />
      </Box>
    </Box>
  );
};
