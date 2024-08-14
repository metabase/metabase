import { formatNumber } from "metabase/static-viz/lib/numbers";
import { truncateText } from "metabase/static-viz/lib/text";
import type { ColorGetter } from "metabase/visualizations/types";

import Gauge from "./Gauge";
import {
  START_ANGLE,
  CHART_WIDTH,
  GAUGE_OUTER_RADIUS,
  CHART_VERTICAL_MARGIN,
  GAUGE_INNER_RADIUS,
  SEGMENT_LABEL_MARGIN,
  DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
  MAX_SEGMENT_VALUE_WIDTH,
  SEGMENT_LABEL_FONT_SIZE,
} from "./constants";
import type { Card, Data, GaugeLabelData, Position } from "./types";
import {
  populateDefaultColumnSettings,
  removeDuplicateElements,
  calculateRelativeValueAngle,
  calculateSegmentLabelPosition,
  calculateSegmentLabelTextAnchor,
  gaugeSorter,
  fixSwappedMinMax,
} from "./utils";

export interface GaugeContainerProps {
  card: Card;
  data: Data;
  getColor: ColorGetter;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function GaugeContainer({
  card,
  data,
  getColor,
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
    .flatMap(segmentDatum => {
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
          color: getColor("text-medium"),
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
          color: getColor("text-medium"),
        };
      }

      return {
        position: calculateSegmentLabelPosition(segmentValueAngle),
        textAnchor: calculateSegmentLabelTextAnchor(segmentValueAngle),
        value: valueFormatter(segmentValue),
        color: getColor("text-medium"),
      };
    });

  const segmentLabels: GaugeLabelData[] = segments
    .filter(segment => segment.label)
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
          SEGMENT_LABEL_FONT_SIZE,
        ),
        color: getColor("text-dark"),
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
    />
  );
}
