import { useEffect, useMemo, useRef } from "react";
import _ from "underscore";

import { Tooltip } from "metabase/common/components/Tooltip";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
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

/**
 * Fixes a race condition where an ECharts rerender removes `element` before tippy can read its position
 */
function useStableTooltipTarget(element: Element | undefined | null) {
  const proxyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      proxyRef.current?.remove();
      proxyRef.current = null;
    };
  }, []);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return proxyRef.current;
  }

  if (!proxyRef.current) {
    proxyRef.current = document.createElement("div");
    proxyRef.current.style.position = "fixed";
    proxyRef.current.style.pointerEvents = "none";
    proxyRef.current.setAttribute("data-testid", "chart-tooltip-proxy");
    document.body.appendChild(proxyRef.current);
  }

  const proxy = proxyRef.current;
  proxy.style.left = `${rect.left}px`;
  proxy.style.top = `${rect.top}px`;
  proxy.style.width = `${rect.width}px`;
  proxy.style.height = `${rect.height}px`;

  return proxy;
}

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

  const hasTargetEvent = hovered?.event != null;
  const proxyTarget = useStableTooltipTarget(hovered?.element);
  const isOpen = isNotEmpty && (proxyTarget != null || hasTargetEvent);
  const isPadded = hovered?.stackedTooltipModel == null;

  const target = proxyTarget
    ? proxyTarget
    : hovered?.event != null
      ? getEventTarget(hovered.event)
      : null;

  return target ? (
    <Tooltip
      preventOverflow
      reference={target}
      isOpen={isOpen}
      isPadded={isPadded}
      tooltip={tooltip}
      maxWidth="unset"
    />
  ) : null;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartTooltip;
