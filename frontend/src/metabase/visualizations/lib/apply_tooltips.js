/// code to "apply" chart tooltips. (How does one apply a tooltip?)

import _ from "underscore";
import d3 from "d3";

import { formatValue } from "metabase/lib/formatting";
import type { ClickObject } from "metabase/meta/types/Visualization";

import { isNormalized, isStacked } from "./renderer_utils";
import { determineSeriesIndexFromElement } from "./tooltip";
import { getFriendlyName } from "./utils";

function clickObjectFromEvent(
  element,
  d,
  { series, isStacked, isScalarSeries },
) {
  let [
    {
      data: { cols },
    },
  ] = series;
  const seriesIndex = determineSeriesIndexFromElement(element, isStacked);
  const card = series[seriesIndex].card;
  const isSingleSeriesBar =
    element.classList.contains("bar") && series.length === 1;

  let clicked: ?ClickObject;
  if (Array.isArray(d.key)) {
    // scatter
    clicked = {
      value: d.key[2],
      column: cols[2],
      dimensions: [
        { value: d.key[0], column: cols[0] },
        { value: d.key[1], column: cols[1] },
      ].filter(
        ({ column }) =>
          // don't include aggregations since we can't filter on them
          column.source !== "aggregation",
      ),
      origin: d.key._origin,
    };
  } else if (isScalarSeries) {
    // special case for multi-series scalar series, which should be treated as scalars
    clicked = {
      value: d.data.value,
      column: series[seriesIndex].data.cols[1],
    };
  } else if (d.data) {
    // line, area, bar
    if (!isSingleSeriesBar) {
      cols = series[seriesIndex].data.cols;
    }
    clicked = {
      value: d.data.value,
      column: cols[1],
      dimensions: [{ value: d.data.key, column: cols[0] }],
    };
  } else {
    clicked = {
      dimensions: [],
    };
  }

  // handle multiseries
  if (clicked && series.length > 1) {
    if (card._breakoutColumn) {
      // $FlowFixMe
      clicked.dimensions.push({
        value: card._breakoutValue,
        column: card._breakoutColumn,
      });
    }
  }

  if (card._seriesIndex != null) {
    // $FlowFixMe
    clicked.seriesIndex = card._seriesIndex;
  }

  if (clicked) {
    const isLine = element.classList.contains("dot");
    return {
      index: isSingleSeriesBar ? -1 : seriesIndex,
      element: isLine ? element : null,
      event: isLine ? null : d3.event,
      ...clicked,
    };
  }
}

// series = an array of serieses (?) in the chart. There's only one thing in here unless we're dealing with a multiseries chart
function applyChartTooltips(
  chart,
  series,
  isStacked,
  isNormalized,
  isScalarSeries,
  onHoverChange,
  onVisualizationClick,
) {
  let [
    {
      data: { cols },
    },
  ] = series;
  chart.on("renderlet.tooltips", function(chart) {
    // remove built-in tooltips
    chart.selectAll("title").remove();

    if (onHoverChange) {
      chart.svg().on("mousemove", () => {
        // NOTE: using event delegation since it's faster than adding event listeners for every element
        const element = d3.event.target;
        const d = d3.select(element).datum();
        if (!d) {
          onHoverChange(null);
          return;
        }

        // const clicked = clickObjectFromEvent(element, d, {
        //   series,
        //   isScalarSeries,
        //   isStacked,
        //  });
        // onHoverChange(clicked);

        // NOTE: preferably we could just use the above but there's some weird
        // edge cases handled by the code below

        const seriesIndex = determineSeriesIndexFromElement(element, isStacked);
        if (seriesIndex == null) {
          return;
        }

        const seriesSettings = chart.settings.series(series[seriesIndex]);
        const seriesTitle = seriesSettings && seriesSettings.title;

        const card = series[seriesIndex].card;

        const isMultiseries = series.length > 1;
        const isBreakoutMultiseries = isMultiseries && card._breakoutColumn;
        const isArea = element.classList.contains("area");
        const isBar = element.classList.contains("bar");
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
        if (Array.isArray(d.key)) {
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
        } else if (d.data) {
          // line, area, bar
          if (!isSingleSeriesBar) {
            cols = series[seriesIndex].data.cols;
          }

          data = [
            {
              key: getColumnDisplayName(cols[0]),
              value: d.data.key,
              col: cols[0],
            },
            {
              key: getColumnDisplayName(cols[1]),
              value: isNormalized
                ? formatValue(d.data.value, {
                    number_style: "percent",
                    column: cols[1],
                  })
                : d.data.value,
              col: { ...cols[1] },
            },
          ];

          const seriesData = series[seriesIndex].data || {};
          const rawCols = seriesData._rawCols;
          const rowIndex = d.data.index;
          const row = rowIndex >= 0 && seriesData.rows[rowIndex];
          const rawRow = row && row._origin && row._origin.row; // get the raw query result row
          // make sure the row index we've determined with our formula above is correct. Check the
          // x/y axis values ("key" & "value") and make sure they match up with the row before setting
          // the data for the tooltip

          if (rawRow && row[0] === d.data.key && row[1] === d.data.value) {
            // rather than just append the additional values we'll just create a new `data` array.
            // simply appending the additional values would result in tooltips whose order switches
            // between different series.
            // Loop over *all* of the columns and create the new array
            data = rawCols.map((col, i) => {
              // if this was one of the original x/y columns keep the original object because it
              // may have the `isNormalized` tweak above.
              if (col === data[0].col) {
                return data[0];
              }
              if (col === data[1].col) {
                return data[1];
              }
              // otherwise just create a new object for any other columns.
              return {
                key: getColumnDisplayName(col),
                value: rawRow[i],
                col: col,
              };
            });
          }
        }

        if (
          isBreakoutMultiseries &&
          !(data.length > 0 && data[0].col === card._breakoutColumn)
        ) {
          data.unshift({
            key: getColumnDisplayName(card._breakoutColumn),
            // Use series title if it's set
            value: seriesTitle ? seriesTitle : card._breakoutValue,
            // Don't include the column if series title is set (it's already formatted)
            col: seriesTitle ? null : card._breakoutColumn,
          });
        }

        data = _.uniq(data, d => d.col);

        onHoverChange({
          // for single series bar charts, fade the series and highlght the hovered element with CSS
          index: isSingleSeriesBar ? -1 : seriesIndex,
          // for area charts, use the mouse location rather than the DOM element
          element: isArea ? null : element,
          event: isArea ? d3.event : null,
          data: data.length > 0 ? data : null,
        });
      });
    }

    function onClick(element, d) {
      if (onVisualizationClick) {
        const clicked = clickObjectFromEvent(element, d, {
          series,
          isScalarSeries,
        });
        if (clicked) {
          onVisualizationClick(clicked);
        }
      }
    }

    chart
      .svg()
      .classed("enable-drill", !!onVisualizationClick)
      // for some reason interaction with brush requires we use click for .dot and .bubble but mousedown for bar
      .on("click", () => {
        // NOTE: using event delegation since it's faster than adding event listeners for every element
        const element = d3.event.target;
        const d = d3.select(element).datum();
        if (d && element.matches(".dot, .bubble")) {
          onClick(element, d);
        }
      })
      .on("mousedown", () => {
        // NOTE: using event delegation since it's faster than adding event listeners for every element
        const element = d3.event.target;
        const d = d3.select(element).datum();
        if (d && element.matches(".bar")) {
          onClick(element, d);
        }
      });
  });
}

export function setupTooltips(
  { settings, series, isScalarSeries, onHoverChange, onVisualizationClick },
  datas,
  parent,
  { isBrushing },
) {
  applyChartTooltips(
    parent,
    series,
    isStacked(settings, datas),
    isNormalized(settings, datas),
    isScalarSeries,
    hovered => {
      // disable tooltips while brushing
      if (onHoverChange && !isBrushing()) {
        // disable tooltips on lines
        if (
          hovered &&
          hovered.element &&
          hovered.element.classList.contains("line")
        ) {
          delete hovered.element;
        }
        onHoverChange(hovered);
      }
    },
    onVisualizationClick,
  );
}
