import { type ReactNode, useMemo, useRef } from "react";
import _ from "underscore";

import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Box, Portal, Tooltip } from "metabase/ui";
import { getEventTarget } from "metabase/utils/dom";
import type {
  HoveredObject,
  HoveredTimelineEvent,
} from "metabase/visualizations/types";
import type { VisualizationSettings } from "metabase-types/api";

import KeyValuePairChartTooltip from "./KeyValuePairChartTooltip";
import StackedDataTooltip from "./StackedDataTooltip";
import TimelineEventTooltip from "./TimelineEventTooltip";

export interface ChartTooltipProps {
  hovered?: HoveredObject | null;
  settings: VisualizationSettings;
}

type TargetRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

const useStableTargetRect = (
  element: Element | undefined | null,
): TargetRect | null => {
  const lastRectRef = useRef<TargetRect | null>(null);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  // An ECharts rerender can momentarily detach `element`, leaving it with a 0x0
  // rect; reuse the last known position so the tooltip doesn't jump or vanish.
  if (rect.width === 0 && rect.height === 0) {
    return lastRectRef.current;
  }

  lastRectRef.current = rect;
  return lastRectRef.current;
};

export const ChartTooltipContent = ({
  hovered,
  settings,
}: ChartTooltipProps) => {
  if (!hovered) {
    return null;
  }
  if (!_.isEmpty(hovered.timelineEvents)) {
    return <TimelineEventTooltip hovered={hovered as HoveredTimelineEvent} />;
  }

  if (hovered.stackedTooltipModel) {
    return <StackedDataTooltip {...hovered.stackedTooltipModel} />;
  }

  return <KeyValuePairChartTooltip hovered={hovered} settings={settings} />;
};

const ChartTooltip = ({
  hovered: untranslatedHoveredObject,
  settings,
}: ChartTooltipProps) => {
  const hovered =
    PLUGIN_CONTENT_TRANSLATION.useTranslateFieldValuesInHoveredObject(
      untranslatedHoveredObject,
    );

  const tooltip = <ChartTooltipContent hovered={hovered} settings={settings} />;

  const isNotEmpty = useMemo(() => {
    if (!hovered) {
      return false;
    }
    return (
      hovered.value !== undefined ||
      !_.isEmpty(hovered.timelineEvents) ||
      !_.isEmpty(hovered.stackedTooltipModel) ||
      !_.isEmpty(hovered.data) ||
      !_.isEmpty(hovered.dimensions)
    );
  }, [hovered]);

  const stableRect = useStableTargetRect(hovered?.element);
  const eventRect =
    hovered?.event !== undefined
      ? getEventTarget(hovered.event).getBoundingClientRect()
      : null;
  const targetRect = stableRect ?? eventRect;

  const isOpen = isNotEmpty && targetRect !== null;

  // Freeze the last content and rect so the tooltip fades out in place instead
  // of blanking and jumping once `hovered` clears.
  const lastDisplayRef = useRef<{
    content: ReactNode;
    rect: TargetRect;
    isPadded: boolean;
  } | null>(null);

  if (isOpen) {
    lastDisplayRef.current = {
      content: tooltip,
      rect: targetRect,
      isPadded: !hovered?.stackedTooltipModel,
    };
  }

  const display = lastDisplayRef.current;

  return (
    <Portal>
      <Tooltip
        opened={isOpen}
        label={display?.content ?? null}
        styles={{
          tooltip: {
            maxWidth: "unset",
            ...(display?.isPadded === false ? { padding: 0 } : null),
          },
        }}
      >
        <Box
          data-testid="chart-tooltip-proxy"
          style={{
            position: "fixed",
            left: display?.rect.left ?? 0,
            top: display?.rect.top ?? 0,
            width: display?.rect.width ?? 0,
            height: display?.rect.height ?? 0,
            pointerEvents: "none",
          }}
        />
      </Tooltip>
    </Portal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartTooltip;
