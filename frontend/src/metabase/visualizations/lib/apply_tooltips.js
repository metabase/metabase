/// code to "apply" chart tooltips. (How does one apply a tooltip?)

import _ from "underscore";
import d3 from "d3";

import { formatValue } from "metabase/lib/formatting";
import type { ClickObject } from "metabase/meta/types/Visualization";

import { isNormalized, isStacked } from "./renderer_utils";
import { determineSeriesIndexFromElement } from "./tooltip";
import { getFriendlyName } from "./utils";

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
  let [{ data: { cols } }] = series;
  chart.on("renderlet.tooltips", function(chart) {
    chart.selectAll("title").remove();

    if (onHoverChange) {
      chart
        .selectAll(".bar, .dot, .area, .line, .bubble")
        .on("mousemove", function(d, i) {
          const seriesIndex = determineSeriesIndexFromElement(this, isStacked);
          const card = series[seriesIndex].card;
          const isSingleSeriesBar =
            this.classList.contains("bar") && series.length === 1;
          const isArea = this.classList.contains("area");

          let data = [];
          if (Array.isArray(d.key)) {
            // scatter
            if (d.key._origin) {
              data = d.key._origin.row.map((value, index) => {
                const col = d.key._origin.cols[index];
                return { key: getFriendlyName(col), value: value, col };
              });
            } else {
              data = d.key.map((value, index) => ({
                key: getFriendlyName(cols[index]),
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
                key: getFriendlyName(cols[0]),
                value: d.data.key,
                col: cols[0],
              },
              {
                key: getFriendlyName(cols[1]),
                value: isNormalized
                  ? `${formatValue(d.data.value) * 100}%`
                  : d.data.value,
                col: cols[1],
              },
            ];

            // now add entries to the tooltip for columns that aren't the X or Y axis. These aren't in
            // the normal `cols` array, which is just the cols used in the graph axes; look in `_rawCols`
            // for any other columns. If we find them, add them at the end of the `data` array.
            //
            // To find the actual row where data is coming from is somewhat overcomplicated because i
            // seems to follow a strange pattern that doesn't directly correspond to the rows in our
            // data. Not sure why but it appears values of i follow this pattern:
            //
            //  [Series 1]  i = 7   i = 8   i = 9  i = 10   i = 11
            //  [Series 0]  i = 1   i = 2   i = 3  i = 4    i = 5
            //             [Row 0] [Row 1] [Row 2] [Row 3] [Row 4]
            //
            // Deriving the rowIndex from i can be done as follows:
            // rowIndex = (i % (numRows + 1)) - 1;
            //
            // example: for series 1, i = 10
            // rowIndex = (10 % 6) - 1 = 4 - 1 = 3
            //
            // for series 0, i = 3
            // rowIndex = (3 % 6) - 1 = 3 - 1 = 2
            const seriesData = series[seriesIndex].data || {};
            const rawCols = seriesData._rawCols;
            const rows = seriesData && seriesData.rows;
            const rowIndex = rows && i % (rows.length + 1) - 1;
            const row = rowIndex != null && seriesData.rows[rowIndex];
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
                  key: getFriendlyName(col),
                  value: rawRow[i],
                  col: col,
                };
              });
            }
          }

          if (data && series.length > 1) {
            if (card._breakoutColumn) {
              data.unshift({
                key: getFriendlyName(card._breakoutColumn),
                value: card._breakoutValue,
                col: card._breakoutColumn,
              });
            }
          }

          data = _.uniq(data, d => d.col);

          onHoverChange({
            // for single series bar charts, fade the series and highlght the hovered element with CSS
            index: isSingleSeriesBar ? -1 : seriesIndex,
            // for area charts, use the mouse location rather than the DOM element
            element: isArea ? null : this,
            event: isArea ? d3.event : null,
            data: data.length > 0 ? data : null,
          });
        })
        .on("mouseleave", function() {
          if (!onHoverChange) {
            return;
          }
          onHoverChange(null);
        });
    }

    if (onVisualizationClick) {
      const onClick = function(d) {
        const seriesIndex = determineSeriesIndexFromElement(this, isStacked);
        const card = series[seriesIndex].card;
        const isSingleSeriesBar =
          this.classList.contains("bar") && series.length === 1;

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
          const isLine = this.classList.contains("dot");
          onVisualizationClick({
            ...clicked,
            element: isLine ? this : null,
            event: isLine ? null : d3.event,
          });
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
