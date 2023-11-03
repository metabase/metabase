import { Fragment } from "react";
import _ from "underscore";

import { scaleBand } from "@visx/scale";

import type { TextProps } from "@visx/text";
import type { AnyScaleBand, PositionScale } from "@visx/shape/lib/types";
import OutlinedText from "metabase/static-viz/components/Text/OutlinedText";
import { getValueStep, getY, setY } from "./utils";

import type {
  HydratedSeries,
  SeriesDatum,
  StackedDatum,
  VisualizationType,
  XScale,
} from "./types";

type XYAccessor<
  T extends SeriesDatum | StackedDatum = SeriesDatum | StackedDatum,
> = (
  datum: T extends SeriesDatum ? SeriesDatum : StackedDatum,
  flipped?: boolean,
) => number;

type Settings = Record<string, any>;

const VALUES_MARGIN = 6;
// From testing 1px is equal 3px of the stroke width, I'm not totally sure why.
const VALUES_STROKE_MARGIN = 1;
const FLIPPED_VALUES_MARGIN = VALUES_MARGIN + 8;

interface ValuesProps {
  series: HydratedSeries[];
  formatter: (value: number, compact: boolean) => string;
  valueProps: Partial<TextProps>;
  xScale: XScale;
  yScaleLeft: PositionScale | null;
  yScaleRight: PositionScale | null;
  innerWidth: number;
  areStacked: boolean;
  xAxisYPos: number;
  settings?: Settings;
}

interface Value {
  datum: SeriesDatum | StackedDatum;
  datumForLabel: SeriesDatum | StackedDatum;
  flipped?: boolean;
  hidden?: boolean;
}

interface MultiSeriesValue extends Value {
  series: HydratedSeries;
  xScale: XScale;
  yScale: PositionScale;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function Values({
  series: multipleSeries,
  formatter,
  valueProps,
  xScale,
  yScaleLeft,
  yScaleRight,
  innerWidth,
  areStacked,
  xAxisYPos,
  settings,
}: ValuesProps) {
  const containBars = Boolean(xScale.bandwidth);
  const barSeriesIndexMap = new WeakMap();
  let innerBarScale: AnyScaleBand | undefined = undefined;
  if (containBars && xScale.bandwidth) {
    const innerBarScaleDomain = multipleSeries.map((barSeries, index) => {
      barSeriesIndexMap.set(barSeries, index);
      return index;
    });
    innerBarScale = scaleBand({
      domain: innerBarScaleDomain,
      range: [0, xScale.bandwidth],
    });
  }

  const multiSeriesValues: MultiSeriesValue[][] = multipleSeries.map(series => {
    const singleSeriesValues = getValues(series, areStacked, settings);

    return singleSeriesValues.map(value => {
      return {
        ...value,
        series,
        xScale,
        yScale: (series.yAxisPosition === "left"
          ? yScaleLeft
          : yScaleRight) as PositionScale,
      };
    });
  });

  function getBarXOffset(series: HydratedSeries) {
    if (containBars && innerBarScale) {
      // Use the same logic when rendering <BarSeries />, as bar charts can display values in groups.
      // https://github.com/metabase/metabase/blob/44fa5e5cc1ee7c43c24774d2fd19ef16d8b40bfa/frontend/src/metabase/static-viz/components/XYChart/shapes/BarSeries.tsx#L61
      const innerX = innerBarScale(barSeriesIndexMap.get(series)) ?? 0;
      const width = innerBarScale.bandwidth();
      return innerX + width / 2;
    }

    return 0;
  }

  const verticalOverlappingFreeValues = fixVerticalOverlappingValues(
    multiSeriesValues,
    xAxisYPos,
    getBarXOffset,
  );

  return (
    <>
      {verticalOverlappingFreeValues.map((singleSeriesValues, seriesIndex) => {
        const compact = getCompact(
          singleSeriesValues.map(value => value.datum),
        );

        return fixHorizontalOverlappingValues(
          seriesIndex,
          compact,
          singleSeriesValues,
        ).map((value, index) => {
          if (value.hidden) {
            return null;
          }

          const { xAccessor, yAccessor } = getXyAccessors(
            value.series.type,
            value.xScale,
            value.yScale,
            getBarXOffset(value.series),
            value.flipped,
          );

          return (
            <Fragment key={index}>
              <OutlinedText
                x={xAccessor(value.datum)}
                y={yAccessor(value.datum)}
                textAnchor="middle"
                verticalAnchor="end"
                {...valueProps}
              >
                {formatter(getY(value.datumForLabel), compact)}
              </OutlinedText>
            </Fragment>
          );
        });
      })}
    </>
  );

  function getCompact(data: (SeriesDatum | StackedDatum)[]) {
    // Use the same logic as in https://github.com/metabase/metabase/blob/1276595f073883853fed219ac185d0293ced01b8/frontend/src/metabase/visualizations/lib/chart_values.js#L178-L179
    const getAvgLength = (compact: boolean) => {
      const lengths = data.map(
        ([_, yValue]) => formatter(Number(yValue), compact).length,
      );
      return lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
    };

    return getAvgLength(true) < getAvgLength(false) - 3;
  }

  function fixHorizontalOverlappingValues(
    seriesIndex: number,
    compact: boolean,
    singleSeriesValues: MultiSeriesValue[],
  ) {
    const valueStep = getValueStep(
      multipleSeries,
      seriesIndex,
      value => formatter(value, compact),
      valueProps,
      innerWidth,
    );

    return singleSeriesValues.filter((_, index) => index % valueStep === 0);
  }
}

function getValues(
  series: HydratedSeries,
  areStacked: boolean,
  settings?: Settings,
): Value[] {
  const data = series.data;

  return transformDataToValues(series.type, data, settings);
}

function getXyAccessors(
  type: VisualizationType,
  xScale: XScale,
  yScale: PositionScale,
  barXOffset: number,
  flipped?: boolean,
): {
  xAccessor: XYAccessor;
  yAccessor: XYAccessor;
  dataYAccessor: XYAccessor;
} {
  return {
    xAccessor: getXAccessor(type, xScale, barXOffset),
    yAccessor: (datum, overriddenFlipped = flipped) =>
      (yScale(getY(datum)) ?? 0) +
      (overriddenFlipped ? FLIPPED_VALUES_MARGIN : -VALUES_MARGIN),
    dataYAccessor: datum => yScale(getY(datum)) ?? 0,
  };
}

function getXAccessor(
  type: VisualizationType,
  xScale: XScale,
  barXOffset: number,
): XYAccessor {
  switch (type) {
    case "waterfall":
      return xScale.lineAccessor as XYAccessor;
    default:
      exhaustiveCheck(type);
  }
}

function exhaustiveCheck(param: never): never {
  throw new Error("Should not reach here");
}

function transformDataToValues(
  type: VisualizationType,
  data: (SeriesDatum | StackedDatum)[],
  settings?: Settings,
): Value[] {
  let total = 0;
  return data.map((datum, index) => {
    total = total + getY(datum);
    const isShowingTotal = settings?.showTotal && index === data.length - 1;
    return {
      datum: !isShowingTotal ? setY(datum, total) : datum,
      datumForLabel: datum,
    };
  });
}

interface Position {
  xPos: number;
  yPos: number;
}

function fixVerticalOverlappingValues(
  multiSeriesValues: MultiSeriesValue[][],
  xAxisYPos: number,
  getBarXOffset: (series: HydratedSeries) => number,
) {
  // prevent collision by mutating each item inside the list
  // Same logic as in https://github.com/metabase/metabase/blob/fa6ee214e9b8d2fb4cccf4fc88dc1701face777b/frontend/src/metabase/visualizations/lib/chart_values.js#L351
  _.chain(multiSeriesValues)
    .flatten()
    .flatten()
    .map(value => {
      const { xAccessor, yAccessor } = getXyAccessors(
        value.series.type,
        value.xScale,
        value.yScale,
        getBarXOffset(value.series),
        value.flipped,
      );

      return {
        originalValue: value,
        position: {
          xPos: xAccessor(value.datum),
          yPos: yAccessor(value.datum),
        },
        alternativePosition: {
          xPos: xAccessor(value.datum),
          yPos: yAccessor(value.datum, !value.flipped),
        },
      };
    })
    .groupBy(positionedValue => {
      return positionedValue.position.xPos;
    })
    .each(group => {
      const sortedByY = _.sortBy(group, value => value.position.yPos);

      // Fix first value collision only with X-axis since in viz app,
      // we started fixing collisions from the second value.
      // So the first value stays in place.
      // https://github.com/metabase/metabase/blob/93350352b92265bb84be6249bce101fe8c89f7d1/frontend/src/metabase/visualizations/lib/chart_values.js#L366
      fixValueCollision([], sortedByY[0]);

      // Fix both value collision and X-axis starting from the second value.
      const INDEX_OFFSET = 1;
      sortedByY.slice(INDEX_OFFSET).forEach((value, index) => {
        const otherValues = [
          ...sortedByY.slice(0, index + INDEX_OFFSET),
          ...sortedByY.slice(index + INDEX_OFFSET + 1),
        ].map(value => value.position);

        fixValueCollision(otherValues, value);
      });
    });

  function fixValueCollision(
    otherValues: Position[],
    value: {
      position: Position;
      alternativePosition: Position;
      originalValue: Value;
    },
  ) {
    if (hasCollisions(otherValues, value.position, xAxisYPos)) {
      if (hasCollisions(otherValues, value.alternativePosition, xAxisYPos)) {
        value.originalValue.hidden = true;
      } else {
        value.position = value.alternativePosition;
        value.originalValue.flipped = !value.originalValue.flipped;
      }
    }
  }

  return multiSeriesValues;
}

const MIN_SPACING = 20;
function hasCollisions(
  otherValues: Position[],
  value: Position,
  xAxisYPos: number,
) {
  const minDistanceFromOtherValues = Math.min(
    ...otherValues.map(distanceFrom(value)),
  );
  return (
    minDistanceFromOtherValues < MIN_SPACING ||
    value.yPos + VALUES_STROKE_MARGIN > xAxisYPos
  );
}

function distanceFrom(value: Position) {
  return (comparedValue: Position) => Math.abs(comparedValue.yPos - value.yPos);
}
