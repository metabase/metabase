/// code to "apply" chart tooltips. (How does one apply a tooltip?)

import d3 from "d3";
import moment from "moment-timezone";
import { getIn } from "icepick";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import { formatNullable } from "metabase/lib/formatting/nullable";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { isNormalized, isStacked } from "./renderer_utils";
import {
  determineSeriesIndexFromElement,
  formatValueForTooltip,
} from "./tooltip";
import { getFriendlyName } from "./utils";

const DIMENSION_INDEX = 0;
const METRIC_INDEX = 1;

function getColumnDisplayName(
  col,
  settings,
  isBreakout,
  colVizSettingsKey = col.name,
) {
  const colTitle = getIn(settings, [
    "series_settings",
    colVizSettingsKey,
    "title",
  ]);

  // don't replace with series title for breakout multiseries since the series title is shown in the breakout value
  if (!isBreakout && colTitle) {
    return colTitle;
  }

  return getFriendlyName(col);
}

function isDashboardAddedSeries(series, seriesIndex, dashboard) {
  // the first series by definition can't be an "added" series
  if (!dashboard || seriesIndex === 0) {
    return false;
  }

  const { card: firstCardInSeries } = series[0];
  const { card: addedSeriesCard } = series[seriesIndex];

  // find the dashcard associated with the first series
  const dashCard = dashboard.ordered_cards.find(
    dashCard => dashCard.card_id === firstCardInSeries.id,
  );

  // evaluate whether the added series exists in its series array
  // the "series" array on a dashcard is where "added" series are stored
  return (dashCard?.series || []).some(card => card.id === addedSeriesCard.id);
}

export function getClickHoverObject(
  d,
  {
    series,
    datas,
    isNormalized,
    seriesIndex,
    seriesTitle,
    classList,
    event,
    element,
    settings,
    dashboard,
  },
) {
  let { cols } = series[seriesIndex].data;
  const { card } = series[seriesIndex];

  const isMultiseries = series.length > 1;
  const isBreakoutMultiseries = isMultiseries && card._breakoutColumn;
  const isBar = classList.includes("bar");
  const isSingleSeriesBar = isBar && !isMultiseries;

  let data = [];
  let dimensions = [];
  let value;
  if (Array.isArray(d.key)) {
    value = d.key[2];
    // scatter
    if (d.key._origin) {
      data = d.key._origin.row.map((value, index) => {
        const col = d.key._origin.cols[index];
        return {
          key: getColumnDisplayName(col, settings, isBreakoutMultiseries),
          value: value,
          col,
        };
      });
    } else {
      data = d.key.map((value, index) => ({
        key: getColumnDisplayName(cols[index], settings, isBreakoutMultiseries),
        value: value,
        col: cols[index],
      }));
    }
    dimensions = [
      { value: d.key[0], column: cols[0] },
      { value: d.key[1], column: cols[1] },
    ];
    if (isBreakoutMultiseries) {
      const { _breakoutValue: value, _breakoutColumn: column } = card;
      dimensions.push({ value, column });
    }
  } else if (d.data) {
    ({ value } = d.data);
    // line, area, bar
    if (!isSingleSeriesBar) {
      cols = series[seriesIndex].data.cols;
    }

    const seriesData = series[seriesIndex].data || {};
    const rawCols = seriesData._rawCols || cols;
    const { key } = d.data;

    // We look through the rows to match up they key in d.data to the x value
    // from some rows. There might be multiple rows in case of unaggregated data.
    const rows = datas[seriesIndex].filter(
      ([x]) => key === x || (moment.isMoment(key) && key.isSame(x)),
    );

    const isAddedSeriesOnDashcard = isDashboardAddedSeries(
      series,
      seriesIndex,
      dashboard,
    );
    const isCardNameTakenFromColumnName = cols.some(
      col => col.name === card.name,
    );
    const isCardNameCombinedWithColumnDisplayName = cols.some(
      col => card.name === `${card.originalCardName}: ${col.display_name}`,
    );
    const colVizSettingsKeys = rawCols.map((rawCol, colIndex) => {
      // Series that have been added to dashcards as "additional series" can have weird viz settings keys.
      // Typically the viz settings key is the column name, but to avoid scenarios where the added series
      // repeats column names, the card name is used OR some combo of the card name and column display_name is used.
      if (
        isAddedSeriesOnDashcard &&
        // Sometimes (bar charts only?), the card name is set to one of the column names (not necessarily the `rawCol` in this function).
        // In that scenario, we can probably be confident that the viz settings key for the column is the column name.
        !isCardNameTakenFromColumnName &&
        // the x axis (first) column uses the column name
        colIndex >= 1
      ) {
        // When there are multiple series in a card, the column name is combined with the card name,
        // (remember: this `card` object has a `name` property that has been changed in `LineAreaBarChart`),
        // so we need to reconstruct the viz settings key using the original card name and the column display name
        if (isCardNameCombinedWithColumnDisplayName) {
          return `${card.originalCardName}: ${rawCol.display_name}`;
        } else {
          return card.originalCardName;
        }
      }

      return rawCol.name;
    });

    // try to get rows from _origin
    const rawRows = rows
      .map(row => {
        return row._origin && row._origin.row;
      })
      .filter(Boolean);

    // aggregate rows to show correct values from unaggregated data
    const aggregatedRow = aggregateRows(rawRows.length > 0 ? rawRows : rows);

    // Loop over *all* of the columns and create the new array
    if (aggregatedRow) {
      data = rawCols.map((col, i) => {
        if (isNormalized && cols[1].field_ref === col.field_ref) {
          return {
            key: getColumnDisplayName(cols[1], settings, isBreakoutMultiseries),
            value: formatValue(d.data.value, {
              number_style: "percent",
              column: cols[1],
              decimals: cols[1].decimals,
            }),
            col: col,
          };
        }
        return {
          key: getColumnDisplayName(
            col,
            settings,
            isBreakoutMultiseries,
            colVizSettingsKeys[i],
          ),
          value: formatNullable(aggregatedRow[i]),
          col: col,
        };
      });
      dimensions = rawCols.map((column, i) => ({
        column,
        value: aggregatedRow[i],
      }));
    }
  } else if (isBreakoutMultiseries) {
    // an area doesn't have any data, but might have a breakout series to show
    const { _breakoutValue: value, _breakoutColumn: column } = card;
    data = [
      {
        key: getColumnDisplayName(column, settings, isBreakoutMultiseries),
        col: column,
        value,
      },
    ];
    dimensions = [{ column, value }];
  }

  // overwrite value/col for breakout column
  data = data.map(d =>
    d.col === card._breakoutColumn
      ? {
          ...d,
          // Use series title if it's set
          value: seriesTitle ? seriesTitle : card._breakoutValue,
          // Don't include the column if series title is set (it's already formatted)
          col: seriesTitle ? null : card._breakoutColumn,
        }
      : d,
  );

  dimensions = dimensions.filter(
    ({ column }) =>
      // don't include aggregations since we can't filter on them
      column.source !== "aggregation" &&
      // these columns come from scalar series names
      column.source !== "query-transform",
  );

  // NOTE: certain values such as booleans were coerced to strings at some point. fix them.
  for (const dimension of dimensions) {
    dimension.value = parseBooleanStringValue(dimension);
  }
  const column = series[seriesIndex].data.cols[1];
  value = parseBooleanStringValue({ column, value });

  // We align tooltips differently depending on the type of chart and whether
  // the user is hovering/clicked.
  //
  // On hover, we want to put the tooltip statically next to the hovered element
  // *unless* the element is an area. Those are weirdly shaped, so we put the
  // tooltip next to the mouse.
  //
  // On click, it's somewhat reversed. Typically we want the tooltip to appear
  // right next to where the user just clicked. The exception is line charts.
  // There we want to snap to the closest hovered dot since the voronoi snapping
  // we do means the mouse might be slightly off.
  const isLine = classList.includes("dot");
  const isArea = classList.includes("area");
  const shouldUseMouseCoordinates =
    event.type === "mousemove" ? isArea : !isLine;

  return {
    // for single series bar charts, fade the series and highlght the hovered element with CSS
    index: isSingleSeriesBar ? -1 : seriesIndex,
    element: !shouldUseMouseCoordinates ? element : null,
    event: shouldUseMouseCoordinates ? event : null,
    data: data.length > 0 ? data : null,
    dimensions,
    value,
    column,
    settings,
    seriesIndex,
  };
}

function parseBooleanStringValue({ column, value }) {
  if (column && column.base_type === "type/Boolean") {
    if (value === "true") {
      return true;
    } else if (value === "false") {
      return false;
    }
  }
  return value;
}

function aggregateRows(rows) {
  if (!rows.length) {
    return null;
  }

  const aggregatedRow = [...rows[0]];

  for (let i = 1; i < rows.length; i++) {
    // The first element is the X-axis value and should not be aggregated
    for (let colIndex = 1; colIndex < rows[i].length; colIndex++) {
      const value = rows[i][colIndex];

      if (typeof value === "number") {
        aggregatedRow[colIndex] += value;
      }
    }
  }

  return aggregatedRow;
}

const shouldShowStackedTooltip = (settings, series) => {
  const hasStackedSettings = isStacked(settings, series);
  const isSuitableVizType = series.every(series =>
    ["bar", "area"].includes(series.card?.display),
  );

  return hasStackedSettings && isSuitableVizType;
};

export const getStackedTooltipModel = (
  multipleCardSeries,
  datas,
  settings,
  hoveredIndex,
  dashboard,
  xValue,
) => {
  const seriesWithGroupedData = multipleCardSeries.map((series, index) => ({
    ...series,
    groupedData: datas[index],
    isHovered: hoveredIndex === index,
    seriesIndex: index,
  }));

  const hoveredSeries = seriesWithGroupedData[hoveredIndex];
  const hoveredCardId = hoveredSeries?.card?.id;
  const hoveredCardSeries = seriesWithGroupedData.filter(
    series => series.card?.id === hoveredCardId,
  );
  const hasBreakout = hoveredCardSeries?.some(
    series => series.card?._breakoutColumn != null,
  );

  const seriesToShow = hasBreakout
    ? hoveredCardSeries
    : seriesWithGroupedData.filter(
        series => series.card?._breakoutColumn == null,
      );

  const formattedXValue = formatValueForTooltip({
    value: xValue,
    column: hoveredSeries?.data?.cols[DIMENSION_INDEX],
  });

  const totalFormatter = value =>
    formatValueForTooltip({
      value,
      settings,
      column: hoveredSeries?.data?.cols[METRIC_INDEX],
    });

  const tooltipRows = seriesToShow
    .map(series => {
      const { card, groupedData, data } = series;
      const datum = groupedData?.find(
        datum => datum[DIMENSION_INDEX] === xValue,
      );

      if (!datum) {
        return null;
      }

      const value = datum[METRIC_INDEX];
      const valueColumn = data.cols[METRIC_INDEX];

      let name = null;
      if (hasBreakout) {
        name = settings.series(series)?.["title"] ?? card.name;
      } else {
        const hasMultipleMetricsInCard =
          multipleCardSeries.filter(
            singleSeries => series.card?.id === singleSeries.card?.id,
          ).length > 1;
        const isAddedSeriesOnDashcard = isDashboardAddedSeries(
          multipleCardSeries,
          series.seriesIndex,
          dashboard,
        );

        let settingsKey = null;
        if (isAddedSeriesOnDashcard) {
          settingsKey = hasMultipleMetricsInCard
            ? `${card.originalCardName}: ${valueColumn.display_name}`
            : card.name;
        } else {
          settingsKey = valueColumn.name;
        }

        name = getColumnDisplayName(valueColumn, settings, false, settingsKey);
      }

      const colorKey = keyForSingleSeries(series);
      const color = settings["series_settings.colors"][colorKey];

      return {
        color,
        name,
        value,
        isHovered: series.isHovered,
        formatter: value =>
          formatValueForTooltip({
            value,
            settings,
            column: valueColumn,
          }),
      };
    })
    .filter(Boolean);

  const [headerRows, bodyRows] = _.partition(tooltipRows, row => row.isHovered);

  return {
    headerTitle: formattedXValue,
    headerRows,
    bodyRows,
    totalFormatter: hasBreakout ? totalFormatter : undefined,
    showTotal: hasBreakout,
    showPercentages: hasBreakout,
  };
};

export function setupTooltips(
  {
    settings,
    series,
    isScalarSeries,
    onHoverChange,
    onVisualizationClick,
    dashboard,
  },
  datas,
  chart,
  { isBrushing },
) {
  const stacked = isStacked(settings, datas);
  const normalized = isNormalized(settings, datas);

  const getClickHoverHelper = (target, d) => {
    const seriesIndex = determineSeriesIndexFromElement(target, stacked);
    const seriesSettings = chart.settings.series(series[seriesIndex]);
    const seriesTitle = seriesSettings && seriesSettings.title;
    const classList = [...target.classList.values()]; // values returns an iterator, but getClickHoverObject uses Array#includes

    // no tooltips when brushing
    if (isBrushing()) {
      return null;
    }
    // no tooltips over lines
    if (classList.includes("line")) {
      return null;
    }

    const mouseEventData = getClickHoverObject(d, {
      classList,
      seriesTitle,
      seriesIndex,
      series,
      datas,
      isNormalized: normalized,
      isScalarSeries,
      isStacked: stacked,
      event: d3.event,
      element: target,
      settings,
      dashboard,
    });

    const shouldShowStaticTooltip =
      d.x != null && shouldShowStackedTooltip(settings, series);

    if (shouldShowStaticTooltip) {
      mouseEventData.stackedTooltipModel = getStackedTooltipModel(
        series,
        datas,
        settings,
        seriesIndex,
        dashboard,
        d.x,
      );
    }

    return mouseEventData;
  };

  chart.on("renderlet.tooltips", function (chart) {
    // remove built-in tooltips
    chart.selectAll("title").remove();

    if (onHoverChange) {
      chart
        .selectAll(".bar, .dot, .area, .line, .bubble")
        .on("mousemove", function (d) {
          const hovered = getClickHoverHelper(this, d);
          onHoverChange(hovered);
        })
        .on("mouseleave", function () {
          onHoverChange(null);
        });
    }

    if (onVisualizationClick) {
      const onClick = function (d) {
        const clicked = getClickHoverHelper(this, d);
        if (clicked) {
          onVisualizationClick(clicked);
        }
      };

      // for some reason interaction with brush requires we use click for .dot and .bubble but mousedown for bar
      chart
        .selectAll(".dot, .bubble")
        .style({ cursor: "pointer" })
        .on("click", onClick);
      chart
        .selectAll(".bar")
        .style({ cursor: "pointer" })
        .on("mousedown", onClick);
    }
  });
}
