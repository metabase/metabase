/// Logic for rendering a rows chart.

import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";

import { formatValue } from "metabase/lib/formatting";

import {
  initChart,
  forceSortedGroup,
  makeIndexMap,
  formatNull,
} from "./renderer_utils";
import { getFriendlyName } from "./utils";
import { checkXAxisLabelOverlap } from "./LineAreaBarPostRender";

const ROW_GAP = 5;
const ROW_MAX_HEIGHT = 30;

export default function rowRenderer(
  element,
  { settings, series, onHoverChange, onVisualizationClick, height },
): DeregisterFunction {
  const { cols } = series[0].data;

  if (series.length > 1) {
    throw new Error("Row chart does not support multiple series");
  }

  const chart = dc.rowChart(element);

  // disable clicks
  chart.onClick = () => {};

  // dc.js doesn't give us a way to format the row labels from unformatted data, so we have to
  // do it here then construct a mapping to get the original dimension for tooltipsd/clicks
  const rowsWithFormattedNull = series[0].data.rows.map(([first, ...rest]) => [
    formatNull(first),
    ...rest,
  ]);
  const rows = rowsWithFormattedNull.map(([a, b]) => [
    formatValue(a, { column: cols[0], type: "axis" }),
    b,
  ]);
  const formattedDimensionMap = new Map(
    rows.map(([formattedDimension], index) => [
      formattedDimension,
      rowsWithFormattedNull[index][0],
    ]),
  );

  const dataset = crossfilter(rows);
  const dimension = dataset.dimension(d => d[0]);
  const group = dimension.group().reduceSum(d => d[1]);
  const xDomain = d3.extent(rows, d => d[1]);
  const yValues = rows.map(d => d[0]);

  forceSortedGroup(group, makeIndexMap(yValues));

  initChart(chart, element);

  chart.on("renderlet.tooltips", chart => {
    if (onHoverChange) {
      chart
        .selectAll(".row rect")
        .on("mousemove", (d, i) => {
          onHoverChange &&
            onHoverChange({
              // for single series bar charts, fade the series and highlght the hovered element with CSS
              index: -1,
              event: d3.event,
              data: [
                {
                  key: getFriendlyName(cols[0]),
                  value: formattedDimensionMap.get(d.key),
                  col: cols[0],
                },
                { key: getFriendlyName(cols[1]), value: d.value, col: cols[1] },
              ],
            });
        })
        .on("mouseleave", () => {
          onHoverChange && onHoverChange(null);
        });
    }

    if (onVisualizationClick) {
      chart.selectAll(".row rect").on("click", function(d) {
        onVisualizationClick({
          value: d.value,
          column: cols[1],
          dimensions: [
            {
              value: formattedDimensionMap.get(d.key),
              column: cols[0],
            },
          ],
          element: this,
          settings,
        });
      });
    }
  });

  chart
    .ordinalColors([settings.series(series[0]).color])
    .x(d3.scale.linear().domain(xDomain))
    .elasticX(true)
    .dimension(dimension)
    .group(group)
    .ordering(d => d.index);

  const labelPadHorizontal = 5;
  const labelPadVertical = 1;
  let labelsOutside = false;

  chart.on("renderlet.bar-labels", chart => {
    chart
      .selectAll("g.row text")
      .attr("text-anchor", labelsOutside ? "end" : "start")
      .attr("x", labelsOutside ? -labelPadHorizontal : labelPadHorizontal)
      .classed(labelsOutside ? "outside" : "inside", true);
  });

  if (settings["graph.y_axis.labels_enabled"]) {
    chart.on("renderlet.axis-labels", chart => {
      chart
        .svg()
        .append("text")
        .attr("class", "x-axis-label")
        .attr("text-anchor", "middle")
        .attr("x", chart.width() / 2)
        .attr("y", chart.height() - 10)
        .text(settings["graph.y_axis.title_text"]);
    });
  }

  chart.gap(ROW_GAP);

  // inital render
  chart.render();

  // bottom label height
  let axisLabelHeight = 0;
  if (settings["graph.y_axis.labels_enabled"]) {
    axisLabelHeight = chart
      .select(".x-axis-label")
      .node()
      .getBoundingClientRect().height;
    chart.margins().bottom += axisLabelHeight;
  }

  // cap number of rows to fit
  const rects = chart.selectAll(".row rect")[0];
  const containerHeight =
    rects[rects.length - 1].getBoundingClientRect().bottom -
    rects[0].getBoundingClientRect().top;
  const maxTextHeight = Math.max(
    ...chart
      .selectAll("g.row text")[0]
      .map(e => e.getBoundingClientRect().height),
  );
  const rowHeight = maxTextHeight + chart.gap() + labelPadVertical * 2;
  const cap = Math.max(1, Math.floor(containerHeight / rowHeight));
  chart.cap(cap);

  // assume all bars are same height?
  const barHeight = chart.select("g.row")[0][0].getBoundingClientRect().height;
  if (barHeight > ROW_MAX_HEIGHT) {
    chart.fixedBarHeight(ROW_MAX_HEIGHT);
  }

  chart.render();

  // check if labels overflow after rendering correct number of rows
  let maxTextWidth = 0;
  for (const elem of chart.selectAll("g.row")[0]) {
    const rect = elem.querySelector("rect").getBoundingClientRect();
    const text = elem.querySelector("text").getBoundingClientRect();
    maxTextWidth = Math.max(maxTextWidth, text.width);
    if (rect.width < text.width + labelPadHorizontal * 2) {
      labelsOutside = true;
    }
  }

  if (labelsOutside) {
    chart.margins().left += maxTextWidth;
    chart.render();
  }

  // hide overlapping x-axis labels
  if (checkXAxisLabelOverlap(chart, ".axis text")) {
    chart
      .selectAll(".tick text")[0]
      .slice(1, -1)
      .forEach(e => e.remove());
  }

  // add a class our CSS can target
  chart.svg().classed("rowChart", true);

  return () => {
    dc.chartRegistry.deregister(chart);
  };
}
