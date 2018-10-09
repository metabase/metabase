/// code to "apply" chart tooltips. (How does one apply a tooltip?)

import d3 from "d3";

import type { ClickObject } from "metabase/meta/types/Visualization";

import { isNormalized, isStacked } from "./renderer_utils";
import { determineSeriesIndexFromElement } from "./tooltip";

function clickObjectFromEvent(d, { series, isStacked, isScalarSeries }) {
  let [{ data: { cols } }] = series;
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
    return {
      index: isSingleSeriesBar ? -1 : seriesIndex,
      element: isLine ? this : null,
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
  chart.on("renderlet.tooltips", function(chart) {
    // remove built-in tooltips
    chart.selectAll("title").remove();

    if (onHoverChange) {
      chart
        .selectAll(".bar, .dot, .area, .line, .bubble")
        .on("mousemove", function(d, i) {
          const clicked = clickObjectFromEvent.call(this, d, {
            series,
            isScalarSeries,
            isStacked,
          });
          onHoverChange(clicked);
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
        const clicked = clickObjectFromEvent.call(this, d, {
          series,
          isScalarSeries,
        });
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
