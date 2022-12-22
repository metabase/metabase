import React, { MouseEvent, useMemo } from "react";
import _ from "underscore";
import { getEventTarget } from "metabase/lib/dom";
import Tooltip from "metabase/components/Tooltip";
import { VisualizationSettings } from "metabase-types/api";
import DataPointTooltip from "./DataPointTooltip";
import TimelineEventTooltip from "./TimelineEventTooltip";
import { HoveredObject, HoveredTimelineEvent } from "./types";

export interface ChartTooltipProps {
  hovered?: HoveredObject;
  settings: VisualizationSettings;
}

const ChartTooltip = ({ hovered, settings }: ChartTooltipProps) => {
  const tooltip = useMemo(() => {
    if (!hovered) {
      return null;
    }
    if (!_.isEmpty(hovered.timelineEvents)) {
      return <TimelineEventTooltip hovered={hovered as HoveredTimelineEvent} />;
    }

    if (hovered.dataTooltip) {
      return <DataPointTooltip {...hovered.dataTooltip} />;
    }

    return null;
  }, [hovered]);

  const isNotEmpty = useMemo(() => {
    if (!hovered) {
      return false;
    }
    return (
      hovered.value !== undefined ||
      !_.isEmpty(hovered.timelineEvents) ||
      !_.isEmpty(hovered.dataTooltip) ||
      !_.isEmpty(hovered.data) ||
      !_.isEmpty(hovered.dimensions)
    );
  }, [hovered]);

  const hasTargetEvent = hovered?.event != null;
  const hasTargetElement =
    hovered?.element != null && document.body.contains(hovered.element);
  const isOpen = isNotEmpty && (hasTargetElement || hasTargetEvent);

  const target = hasTargetElement
    ? hovered?.element
    : hasTargetEvent
    ? getEventTarget(hovered.event as MouseEvent)
    : null;

  return target ? (
    <Tooltip
      preventOverflow
      reference={target}
      isPadded={false}
      isOpen={isOpen}
      tooltip={tooltip}
      maxWidth="unset"
    />
  ) : null;
};

export default ChartTooltip;
