import { CHAR_SIZES_FONT_WEIGHT } from "metabase/static-viz/constants/char-sizes";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { ColorGetter } from "metabase/ui/colors/types";
import {
  type GoalData,
  getUnansweredGoalEntities,
  hasFailedGoalReferences,
  resolveGoalSegments,
} from "metabase/visualizations/lib/dynamic-goals";
import { DEFAULT_GAUGE_RANGE } from "metabase/visualizations/visualizations/Gauge/constants";
import {
  getSegmentsRange,
  getValue,
} from "metabase/visualizations/visualizations/Gauge/utils";
import { truncateText } from "metabase/viz-core";

import Gauge from "./Gauge";
import {
  CHART_VERTICAL_MARGIN,
  CHART_WIDTH,
  DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
  GAUGE_INNER_RADIUS,
  GAUGE_OUTER_RADIUS,
  MAX_SEGMENT_VALUE_WIDTH,
  SEGMENT_LABEL_FONT_SIZE,
  SEGMENT_LABEL_MARGIN,
  START_ANGLE,
} from "./constants";
import type { Card, GaugeLabelData, Position } from "./types";
import {
  calculateRelativeValueAngle,
  calculateSegmentLabelPosition,
  calculateSegmentLabelTextAnchor,
  fixSwappedMinMax,
  gaugeSorter,
  populateDefaultColumnSettings,
  removeDuplicateElements,
} from "./utils";

export interface GaugeContainerProps {
  card: Card;
  data: GoalData;
  getColor: ColorGetter;
  hasDevWatermark?: boolean;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function GaugeContainer({
  card,
  data,
  getColor,
  hasDevWatermark = false,
}: GaugeContainerProps) {
  const settings = card.visualization_settings;
  const columnSettings =
    settings.column_settings &&
    populateDefaultColumnSettings(Object.values(settings.column_settings)[0]);
  const goalSegments = settings["gauge.segments"];
  const isUnresolvable =
    getUnansweredGoalEntities(data, goalSegments).length > 0 ||
    hasFailedGoalReferences(data, goalSegments);

  if (isUnresolvable) {
    throw new Error("Couldn't resolve one of this gauge's ranges");
  }

  const segments = resolveGoalSegments(data, goalSegments, getColor)
    .map(fixSwappedMinMax)
    .sort(gaugeSorter);
  const range = getSegmentsRange(segments) ?? DEFAULT_GAUGE_RANGE;
  const [segmentMinValue, segmentMaxValue] = range;

  const center: Position = [
    CHART_WIDTH / 2,
    GAUGE_OUTER_RADIUS + CHART_VERTICAL_MARGIN,
  ];

  const value = getValue(data.rows);

  const valueFormatter = (value: number) => {
    return formatNumber(value, columnSettings);
  };

  const segmentMinMaxLabels: GaugeLabelData[] = [
    ...range,
    ...segments.flatMap((segment) => [segment.min, segment.max]),
  ]
    // gauge segments could be continuous i.e. the current max and the next min is the same value.
    // So we should remove duplicate elements.
    .reduce(removeDuplicateElements, [])
    .map((segmentValue): GaugeLabelData => {
      const isMinSegmentValue = segmentValue === segmentMinValue;
      const isMaxSegmentValue = segmentValue === segmentMaxValue;
      const segmentValueAngle =
        START_ANGLE +
        calculateRelativeValueAngle(
          segmentValue,
          segmentMinValue,
          segmentMaxValue,
        );

      if (isMinSegmentValue) {
        return {
          position: [
            -(GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2,
            SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
          ],
          textAnchor: "middle",
          value: valueFormatter(segmentValue),
          color: getColor("text-secondary"),
        };
      }

      if (isMaxSegmentValue) {
        return {
          position: [
            (GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2,
            SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
          ],
          textAnchor: "middle",
          value: valueFormatter(segmentValue),
          color: getColor("text-secondary"),
        };
      }

      return {
        position: calculateSegmentLabelPosition(segmentValueAngle),
        textAnchor: calculateSegmentLabelTextAnchor(segmentValueAngle),
        value: valueFormatter(segmentValue),
        color: getColor("text-secondary"),
      };
    });

  const segmentLabels: GaugeLabelData[] = segments.flatMap(
    ({ label, min, max }): GaugeLabelData[] => {
      if (!label) {
        return [];
      }

      const angle =
        START_ANGLE +
        calculateRelativeValueAngle(
          (max + min) / 2,
          segmentMinValue,
          segmentMaxValue,
        );

      return [
        {
          position: calculateSegmentLabelPosition(angle),
          textAnchor: calculateSegmentLabelTextAnchor(angle),
          value: truncateText(
            label,
            MAX_SEGMENT_VALUE_WIDTH,
            (text, style) =>
              measureTextWidth(text, Number(style.size), Number(style.weight)),
            {
              size: SEGMENT_LABEL_FONT_SIZE,
              family: "Lato",
              weight: CHAR_SIZES_FONT_WEIGHT,
            },
          ),
          color: getColor("text-primary"),
        },
      ];
    },
  );

  const gaugeLabels = segmentMinMaxLabels.concat(segmentLabels);

  return (
    <Gauge
      value={value}
      valueFormatter={valueFormatter}
      segments={segments}
      range={range}
      gaugeLabels={gaugeLabels}
      center={center}
      getColor={getColor}
      hasDevWatermark={hasDevWatermark}
    />
  );
}
