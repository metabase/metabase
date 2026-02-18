import { useMemo } from "react";
import _ from "underscore";

import { Tooltip } from "metabase/common/components/Tooltip";
import { getEventTarget } from "metabase/lib/dom";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
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
  const hasTargetElement =
    hovered?.element != null && document.body.contains(hovered.element);
  const isOpen = isNotEmpty && (hasTargetElement || hasTargetEvent);
  const isPadded = hovered?.stackedTooltipModel == null;

  const target = hasTargetElement
    ? hovered?.element
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
