import { CHAR_SIZES_FONT_WEIGHT } from "metabase/static-viz/constants/char-sizes";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import { truncateText } from "metabase/visualizations/lib/text";
import type { ColorGetter } from "metabase/visualizations/types";

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
import type { Card, Data, GaugeLabelData, Position } from "./types";
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
  data: Data;
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
  const segments = [...settings["gauge.segments"]]
    .sort(gaugeSorter)
    .map(fixSwappedMinMax);

  const segmentMinValue = segments[0].min;
  const segmentMaxValue = segments[segments.length - 1].max;

  const center: Position = [
    CHART_WIDTH / 2,
    GAUGE_OUTER_RADIUS + CHART_VERTICAL_MARGIN,
  ];

  const value = data.rows[0][0];

  const valueFormatter = (value: number) => {
    return formatNumber(value, columnSettings);
  };

  const segmentMinMaxLabels: GaugeLabelData[] = segments
    .flatMap((segmentDatum) => {
      return [segmentDatum.min, segmentDatum.max];
    })
    // gauge segments could be continuous i.e. the current max and the next min is the same value.
    // So we should remove duplicate elements.
    .reduce(removeDuplicateElements, [])
    .map((segmentValue, index, segmentValues): GaugeLabelData => {
      const isMinSegmentValue = index === 0;
      const isMaxSegmentValue = index === segmentValues.length - 1;
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

  const segmentLabels: GaugeLabelData[] = segments
    .filter((segment) => segment.label)
    .map((segment): GaugeLabelData => {
      const angle =
        START_ANGLE +
        calculateRelativeValueAngle(
          (segment.max + segment.min) / 2,
          segmentMinValue,
          segmentMaxValue,
        );

      return {
        position: calculateSegmentLabelPosition(angle),
        textAnchor: calculateSegmentLabelTextAnchor(angle),
        value: truncateText(
          segment.label,
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
      };
    });

  const gaugeLabels = segmentMinMaxLabels.concat(segmentLabels);

  return (
    <Gauge
      value={value}
      valueFormatter={valueFormatter}
      segments={segments}
      gaugeLabels={gaugeLabels}
      center={center}
      getColor={getColor}
      hasDevWatermark={hasDevWatermark}
    />
  );
}
