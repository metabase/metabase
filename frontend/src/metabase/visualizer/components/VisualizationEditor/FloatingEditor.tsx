import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Box, Text } from "metabase/ui";
import type { DashCardId } from "metabase-types/api";

import S from "./FloatingEditor.module.css";

const PANEL_WIDTH = 420;
const MARGIN = 32;
// The space between the settings card and the edges of the screen.
const PANEL_MARGIN = 16;
// Keep it the same as the transition duration in FloatingEditor.module.css.
const DURATION = 400;

type Rect = { left: number; top: number; width: number; height: number };
type Phase = "enter" | "open" | "leave";

const getViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

function getDashcardElement(dashcardId: DashCardId) {
  return document.querySelector<HTMLElement>(
    `[data-dashcard-id="${dashcardId}"]`,
  );
}

// The settings card is at the right edge of the screen, with a small margin. The chart keeps
// the size of the dashboard card, so that it looks the same as on the
// dashboard, and it is in the center of the rest of the screen. It becomes
// smaller only when it doesn't fit there.
function getLayout(
  origin: Rect | null,
  viewport: { width: number; height: number },
) {
  const areaWidth = viewport.width - PANEL_WIDTH - 2 * PANEL_MARGIN;
  const chartWidth = Math.min(origin?.width ?? 800, areaWidth - 2 * MARGIN);
  const chartHeight = Math.min(
    origin?.height ?? 480,
    viewport.height - 2 * MARGIN,
  );
  const chart: Rect = {
    left: (areaWidth - chartWidth) / 2,
    top: (viewport.height - chartHeight) / 2,
    width: chartWidth,
    height: chartHeight,
  };
  const panel: Rect = {
    left: viewport.width - PANEL_WIDTH - PANEL_MARGIN,
    top: PANEL_MARGIN,
    width: PANEL_WIDTH,
    height: viewport.height - 2 * PANEL_MARGIN,
  };
  return { chart, panel };
}

/**
 * Moves the dashboard card to the center of the screen, and shows the settings
 * in a card next to it. When the editor closes, the card moves back.
 */
export function FloatingEditor({
  dashcardId,
  title,
  chart,
  panel,
  renderHeader,
}: {
  dashcardId: DashCardId;
  title: string | undefined;
  chart: ReactNode;
  panel: ReactNode;
  renderHeader: (animateOut: (done: () => void) => void) => ReactNode;
}) {
  const [origin] = useState<Rect | null>(() => {
    const rect = getDashcardElement(dashcardId)?.getBoundingClientRect();
    return rect
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
      : null;
  });
  const [viewport, setViewport] = useState(getViewport);
  const [phase, setPhase] = useState<Phase>("enter");

  useEffect(() => {
    const handleResize = () => setViewport(getViewport());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // The card on the dashboard stays hidden while its copy is in the editor.
  useEffect(() => {
    const element = getDashcardElement(dashcardId);
    if (element) {
      element.style.visibility = "hidden";
    }
    // Two frames: the first one renders the card at the dashboard position,
    // so that the change of position after it is a transition.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase("open"));
    });
    return () => {
      cancelAnimationFrame(frame);
      if (element) {
        element.style.visibility = "";
      }
    };
  }, [dashcardId]);

  const animateOut = useCallback((done: () => void) => {
    setPhase("leave");
    setTimeout(done, DURATION);
  }, []);

  const layout = getLayout(origin, viewport);
  const chartRect = phase === "open" || !origin ? layout.chart : origin;

  return createPortal(
    <Box className={S.Overlay} data-phase={phase}>
      <Box className={S.ChartCard} style={chartRect}>
        {title && (
          <Text className={S.ChartTitle} fw="bold" truncate>
            {title}
          </Text>
        )}
        <Box className={S.ChartBody}>{chart}</Box>
      </Box>
      <Box className={S.PanelCard} style={layout.panel}>
        {renderHeader(animateOut)}
        {panel}
      </Box>
    </Box>,
    document.body,
  );
}
