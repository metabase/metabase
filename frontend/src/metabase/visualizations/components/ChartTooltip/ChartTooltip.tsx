import React, { useCallback, useMemo, MouseEvent } from "react";
import _ from "underscore";
import Tooltip from "metabase/components/Tooltip";
import {
  HoveredObject,
  HoveredTimelineEvent,
  VisualizationSettings,
} from "./types";
import { getEventTarget } from "./utils";
import DataPointTooltip from "./DataPointTooltip";
import TimelineEventTooltip from "./TimelineEventTooltip";

type ChartTooltipProps = {
  hovered?: HoveredObject;
  settings: VisualizationSettings;
};

const ChartTooltip = ({ hovered, settings }: ChartTooltipProps) => {
  const tooltip = useMemo(() => {
    if (!hovered) {
      return null;
    }
    if (!_.isEmpty(hovered.timelineEvents)) {
      return <TimelineEventTooltip hovered={hovered as HoveredTimelineEvent} />;
    }
    return <DataPointTooltip hovered={hovered} settings={settings} />;
  }, [hovered, settings]);

  const isNotEmpty = useMemo(() => {
    if (!hovered) {
      return false;
    }
    return (
      hovered.value !== undefined ||
      !_.isEmpty(hovered.timelineEvents) ||
      !_.isEmpty(hovered.data) ||
      !_.isEmpty(hovered.dimensions)
    );
  }, [hovered]);

  const hasTargetElement =
    hovered?.element != null && document.body.contains(hovered.element);
  const hasTargetEvent = hovered?.event != null;
  const isOpen = isNotEmpty && (hasTargetElement || hasTargetEvent);

  let target;
  if (hasTargetElement) {
    target = hovered.element;
  } else if (hasTargetEvent) {
    target = getEventTarget(hovered.event as MouseEvent);
  }

  return target ? (
    <Tooltip
      reference={target}
      isOpen={isOpen}
      tooltip={tooltip}
      maxWidth="unset"
    />
  ) : null;
};

export default ChartTooltip;
