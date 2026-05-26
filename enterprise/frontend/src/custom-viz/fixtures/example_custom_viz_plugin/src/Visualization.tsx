import { useState } from "react";
import type { MouseEvent } from "react";
import type { CustomVisualizationProps, RowValue } from "@metabase/custom-viz";
import type { Settings } from "./types";

export const Visualization = (
  props: CustomVisualizationProps<Settings> & { locale: string },
) => {
  const { series, settings, onClick, onHover, locale } = props;
  const { threshold } = settings;
  const { cols, rows } = series[0].data;
  const value = rows[0][0];

  const [lastClickValue, setLastClickValue] = useState<RowValue | null>(null);
  const [lastHoverValue, setLastHoverValue] = useState<RowValue | null>(null);

  if (typeof value !== "number" || typeof threshold !== "number") {
    throw new Error("Value and threshold need to be numbers");
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    setLastClickValue(value);
    onClick({
      value,
      column: cols[0],
      settings,
      event: event.nativeEvent,
      element: event.currentTarget,
      origin: { row: rows[0], cols },
      data: [{ value, col: cols[0] }],
    });
  }

  function handleHoverEnter(event: MouseEvent<HTMLDivElement>) {
    setLastHoverValue(value);
    onHover({
      value,
      column: cols[0],
      event: event.nativeEvent,
      element: event.currentTarget,
      data: [{ key: cols[0].name, value, col: cols[0] }],
    });
  }

  function handleHoverLeave() {
    onHover(null);
  }

  return (
    <div>
      <h1>Custom viz rendered successfully</h1>
      <div>Threshold: {threshold}</div>
      <div>Value: {value}</div>
      <div data-testid="demo-viz-locale">Locale: {locale}</div>
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
