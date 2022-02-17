import React, { useCallback, useMemo, MouseEvent } from "react";
import _ from "underscore";
import Tooltip from "metabase/components/Tooltip";
import {
  HoveredObject,
  HoveredTimelineEvent,
  VisualizationSettings,
} from "./types";
import { getEventTarget } from "./utils";
import DataPointTooltipContent from "./DataPointTooltipContent";
import TimelineEventTooltipContent from "./TimelineEventTooltipContent";

type ChartTooltipProps = {
  hovered?: HoveredObject;
  settings: VisualizationSettings;
};

export default function ChartTooltip({ hovered, settings }: ChartTooltipProps) {
  const hasContentToDisplay = useMemo(() => {
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

  const renderTooltipContent = useCallback(() => {
    if (!hovered) {
      return null;
    }
    if (!_.isEmpty(hovered.timelineEvents)) {
      return (
        <TimelineEventTooltipContent
          hovered={hovered as HoveredTimelineEvent}
        />
      );
    }
    return <DataPointTooltipContent hovered={hovered} settings={settings} />;
  }, [hovered, settings]);

  const hasTargetElement =
    hovered?.element != null && document.body.contains(hovered.element);
  const hasTargetEvent = hovered?.event != null;

  const isOpen = hasContentToDisplay && (hasTargetElement || hasTargetEvent);

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
      tooltip={renderTooltipContent()}
      maxWidth="unset"
    />
  ) : null;
}
