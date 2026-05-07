import React from "react";
import type { CustomVisualizationProps } from "@metabase/custom-viz";
import { ThumbsIcon } from "./ThumbsIcon";
import { Settings } from "./types";
export const Visualization = (
  props: CustomVisualizationProps<Settings> & { locale: string },
) => {
  var series = props.series;
  var settings = props.settings;
  var onClick = props.onClick;
  var onHover = props.onHover;
  var threshold = settings.threshold;
  var data = series[0].data;
  var cols = data.cols;
  var rows = data.rows;
  var value = rows[0][0];

  var lastClickState = React.useState(null);
  var lastClickValue = lastClickState[0];
  var setLastClickValue = lastClickState[1];

  var lastHoverState = React.useState(null);
  var lastHoverValue = lastHoverState[0];
  var setLastHoverValue = lastHoverState[1];

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  function handleClick(ev) {
    setLastClickValue(value);
    onClick({
      value: value,
      column: cols[0],
      settings: settings,
      event: ev.nativeEvent,
      element: ev.currentTarget,
      origin: { row: rows[0], cols: cols },
      data: [{ key: cols[0].name, value: value, col: cols[0] }],
    });
  }

  function handleHoverEnter(ev) {
    setLastHoverValue(value);
    onHover({
      value: value,
      column: cols[0],
      event: ev.nativeEvent,
      element: ev.currentTarget,
      data: [{ key: cols[0].name, value: value, col: cols[0] }],
    });
  }

  function handleHoverLeave() {
    onHover(null);
  }

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  return (
    <div>
      <h1>Custom viz rendered successfully</h1>
      <div>Threshold: {threshold}</div>
      <div>Value: {value}</div>
      <div data-testid="demo-viz-locale">Locale: {props.locale}</div>
      <button
        type="button"
        data-testid="demo-viz-click-target"
        onClick={handleClick}
      >
        Click me
      </button>
      <div
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
        data-testid="demo-viz-hover-target"
      >
        Hover me
      </div>
      <div data-testid="demo-viz-last-click">
        Last clicked: {lastClickValue === null ? "none" : lastClickValue}
      </div>
      <div data-testid="demo-viz-last-hover">
        Last hovered: {lastHoverValue === null ? "none" : lastHoverValue}
      </div>
    </div>
  );
};
