import React from "react";
import _ from "underscore";

import { Text } from "@visx/text";
import { scaleBand } from "@visx/scale";

import { getValueStep, getY } from "../utils";

import type { TextProps } from "@visx/text";
import type { AnyScaleBand, PositionScale } from "@visx/shape/lib/types";
import type {
  HydratedSeries,
  SeriesDatum,
  StackedDatum,
  VisualizationType,
  XYAccessor,
} from "../types";

const VALUES_MARGIN = 6;
const VALUES_STROKE_MARGIN = 3;
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
}

interface XScale {
  bandwidth?: number;
  lineAccessor: XYAccessor<SeriesDatum>;
  barAccessor?: XYAccessor<SeriesDatum>;
}

interface Value {
  datum: SeriesDatum | StackedDatum;
  flipped?: boolean;
  hidden?: boolean;
}

interface MultiSeriesValue extends Value {
  serie: HydratedSeries;
  xScale: XScale;
  yScale: PositionScale;
}

export default function Values({
  series,
  formatter,
  valueProps,
  xScale,
  yScaleLeft,
  yScaleRight,
  innerWidth,
  areStacked,
  xAxisYPos,
}: ValuesProps) {
  const containBars = Boolean(xScale.bandwidth);
  const barSeriesIndexMap = new WeakMap();
  let innerBarScale: AnyScaleBand | undefined = undefined;
  if (containBars && xScale.bandwidth) {
    const innerBarScaleDomain = series
      .filter(series => series.type === "bar")
      .map((barSerie, index) => {
        barSeriesIndexMap.set(barSerie, index);
        return index;
      });
    innerBarScale = scaleBand({
      domain: innerBarScaleDomain,
      range: [0, xScale.bandwidth],
    });
  }

  const multiSeriesValues: MultiSeriesValue[][] = series.map(serie => {
    const singleSerieValues = getValues(serie, areStacked);
    return singleSerieValues.map(value => {
      return {
        ...value,
        serie,
        xScale,
        yScale: (serie.yAxisPosition === "left"
          ? yScaleLeft
          : yScaleRight) as PositionScale,
      };
    });
  });

  function getBarXOffset(serie: HydratedSeries) {
    if (containBars && innerBarScale) {
      // Use the same logic when rendering <BarSeries />, as bar charts can display values in groups.
      // https://github.com/metabase/metabase/blob/44fa5e5cc1ee7c43c24774d2fd19ef16d8b40bfa/frontend/src/metabase/static-viz/components/XYChart/shapes/BarSeries.tsx#L61
      const innerX = innerBarScale(barSeriesIndexMap.get(serie)) ?? 0;
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
      {verticalOverlappingFreeValues.map((singleSerieValues, seriesIndex) => {
        const compact = getCompact(series[seriesIndex]);

        return fixHorizontalOverlappingValues(
          seriesIndex,
          compact,
          singleSerieValues,
        ).map((value, index) => {
          if (value.hidden) {
            return null;
          }

          const { xAccessor, yAccessor } = getXyAccessors(
            value.serie.type,
            value.xScale,
            value.yScale,
            getBarXOffset(value.serie),
            value.flipped,
          );

          return (
            <>
              {/* Render 2 text elements instead of one as a workaround for BE environment that doesn't support `paint-order` CSS property */}
              <Text
                key={index}
                x={xAccessor(value.datum)}
                y={yAccessor(value.datum)}
                textAnchor="middle"
                verticalAnchor="end"
                {...valueProps}
              >
                {formatter(getY(value.datum), compact)}
              </Text>
              <Text
                key={index}
                x={xAccessor(value.datum)}
                y={yAccessor(value.datum)}
                textAnchor="middle"
                verticalAnchor="end"
                {...valueProps}
                stroke={undefined}
                strokeWidth={undefined}
              >
                {formatter(getY(value.datum), compact)}
              </Text>
            </>
          );
        });
      })}
    </>
  );

  function getCompact(serie: HydratedSeries) {
    // Use the same logic as in https://github.com/metabase/metabase/blob/1276595f073883853fed219ac185d0293ced01b8/frontend/src/metabase/visualizations/lib/chart_values.js#L178-L179
    const getAvgLength = (compact: boolean) => {
      const lengths = serie.data.map(
        ([_, yValue]) => formatter(yValue, compact).length,
      );
      return lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
    };

    return getAvgLength(true) < getAvgLength(false) - 3;
  }

  function fixHorizontalOverlappingValues(
    seriesIndex: number,
    compact: boolean,
    singleSerieValues: MultiSeriesValue[],
  ) {
    const valueStep = getValueStep(
      series,
      seriesIndex,
      value => formatter(value, compact),
      valueProps,
      innerWidth,
    );

    return singleSerieValues.filter((_, index) => index % valueStep === 0);
  }
}

function getValues(serie: HydratedSeries, areStacked: boolean): Value[] {
  const data = getData(serie, areStacked);

  return transformDataToValues(serie.type, data);
}

function getData(serie: HydratedSeries, areStacked: boolean) {
  if (serie.type === "area" && areStacked) {
    return serie.stackedData as StackedDatum[];
  }

  return serie.data;
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
} {
  return {
    xAccessor: getXAccessor(type, xScale, barXOffset),
    yAccessor: (datum, overriddenFlipped = flipped) =>
      (yScale(getY(datum)) ?? 0) +
      (overriddenFlipped ? FLIPPED_VALUES_MARGIN : -VALUES_MARGIN),
  };
}

function getXAccessor(
  type: VisualizationType,
  xScale: XScale,
  barXOffset: number,
): XYAccessor {
  if (type === "bar") {
    return datum => (xScale.barAccessor as XYAccessor)(datum) + barXOffset;
  }
  if (type === "line" || type === "area") {
    return xScale.lineAccessor;
  }
  exhaustiveCheck(type);
}

function exhaustiveCheck(param: never): never {
  throw new Error("Should not reach here");
}

function transformDataToValues(
  type: VisualizationType,
  data: (SeriesDatum | StackedDatum)[],
): Value[] {
  if (type === "line") {
    return data.map((datum, index) => {
      // Use the similar logic as presented in https://github.com/metabase/metabase/blob/3f4ca9c70bd263a7579613971ea8d7c47b1f776e/frontend/src/metabase/visualizations/lib/chart_values.js#L130
      const previousValue = data[index - 1];
      const nextValue = data[index + 1];
      const showLabelBelow =
        // first point or prior is greater than y
        (index === 0 || getY(previousValue) > getY(datum)) &&
        // last point point or next is greater than y
        (index >= data.length - 1 || getY(nextValue) > getY(datum));

      return {
        datum,
        flipped: showLabelBelow,
      };
    });
  }

  if (type === "bar") {
    return data.map(datum => {
      const isNegative = getY(datum) < 0;
      return { datum, flipped: isNegative };
    });
  }

  return data.map(datum => {
    return {
      datum,
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
  getBarXOffset: (serie: HydratedSeries) => number,
) {
  // prevent collision by mutating each item inside the list
  // Same logic as in https://github.com/metabase/metabase/blob/fa6ee214e9b8d2fb4cccf4fc88dc1701face777b/frontend/src/metabase/visualizations/lib/chart_values.js#L351
  _.chain(multiSeriesValues)
    .flatten()
    .flatten()
    .map(value => {
      const { xAccessor, yAccessor } = getXyAccessors(
        value.serie.type,
        value.xScale,
        value.yScale,
        getBarXOffset(value.serie),
        value.flipped,
      );

      return {
        originalValue: value,
        serie: value.serie,
        datum: value.datum,
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
