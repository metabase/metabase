/// code to "apply" chart tooltips. (How does one apply a tooltip?)

import d3 from "d3";
import moment from "moment";

import { formatValue } from "metabase/lib/formatting";

import { isNormalized, isStacked, formatNull } from "./renderer_utils";
import { determineSeriesIndexFromElement } from "./tooltip";
import { getFriendlyName } from "./utils";

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
  },
) {
  let { cols } = series[0].data;
  const { card } = series[seriesIndex];

  const isMultiseries = series.length > 1;
  const isBreakoutMultiseries = isMultiseries && card._breakoutColumn;
  const isBar = classList.includes("bar");
  const isSingleSeriesBar = isBar && !isMultiseries;

  // always format the second column as the series name?
  function getColumnDisplayName(col) {
    // don't replace with series title for breakout multiseries since the series title is shown in the breakout value
    if (col === cols[1] && !isBreakoutMultiseries && seriesTitle) {
      return seriesTitle;
    } else {
      return getFriendlyName(col);
    }
  }

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
          key: getColumnDisplayName(col),
          value: value,
          col,
        };
      });
    } else {
      data = d.key.map((value, index) => ({
        key: getColumnDisplayName(cols[index]),
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
    // from some row.
    const row = datas[seriesIndex].find(
      ([x]) => key === x || (moment.isMoment(key) && key.isSame(x)),
    );

    // try to get row from _origin but fall back to the row we already have
    const rawRow = (row && row._origin && row._origin.row) || row;

    // Loop over *all* of the columns and create the new array
    if (rawRow) {
      data = rawCols.map((col, i) => {
        if (isNormalized && cols[1].field_ref === col.field_ref) {
          return {
            key: getColumnDisplayName(cols[1]),
            value: formatValue(d.data.value, {
              number_style: "percent",
              column: cols[1],
              decimals: cols[1].decimals,
            }),
            col: col,
          };
        }
        return {
          key: getColumnDisplayName(col),
          value: formatNull(rawRow[i]),
          col: col,
        };
      });
    }
    dimensions = rawCols.map((column, i) => ({ column, value: rawRow[i] }));
  } else if (isBreakoutMultiseries) {
    // an area doesn't have any data, but might have a breakout series to show
    const { _breakoutValue: value, _breakoutColumn: column } = card;
    data = [{ key: getColumnDisplayName(column), col: column, value }];
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

export function setupTooltips(
  { settings, series, isScalarSeries, onHoverChange, onVisualizationClick },
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

    return getClickHoverObject(d, {
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
    });
  };

  chart.on("renderlet.tooltips", function(chart) {
    // remove built-in tooltips
    chart.selectAll("title").remove();

    if (onHoverChange) {
      chart
        .selectAll(".bar, .dot, .area, .line, .bubble")
        .on("mousemove", function(d) {
          const hovered = getClickHoverHelper(this, d);
          onHoverChange(hovered);
        })
        .on("mouseleave", function() {
          onHoverChange(null);
        });
    }

    if (onVisualizationClick) {
      const onClick = function(d) {
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
