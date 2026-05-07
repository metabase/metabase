/**
 * `demo-viz` fixture used by `e2e/test/scenarios/visualizations-charts/custom-viz.cy.spec.ts`.
 *
 * This is built into a tarball that the e2e admin-flow uploads through the
 * real custom-viz pipeline (admin upload → backend store → frontend
 * fetch → near-membrane sandbox → register). Unlike the Storybook fixture
 * we keep this on the React + `defineConfig` path so the tarball exercises
 * the same contract real customer plugins go through.
 *
 * The `data-testid` attributes and the visible strings ("Custom viz
 * rendered successfully", "Threshold:", "Value:", "Locale:", …) are part
 * of the implicit fixture contract — the e2e spec asserts on them. The
 * plugin runs as standalone JS inside the membrane sandbox, with no
 * access to ttag, so localization rules don't apply here.
 */
/* eslint-disable i18next/no-literal-string */
import { useState } from "react";

import {
  type ClickObject,
  type CreateCustomVisualization,
  type CustomVisualizationProps,
  defineConfig,
} from "../../../src";

type Settings = {
  threshold?: number;
};

const factory: CreateCustomVisualization<Settings> = ({
  defineSetting,
  getAssetUrl,
  locale,
}) => {
  const VisualizationComponent = ({
    series,
    settings,
    onClick,
    onHover,
  }: CustomVisualizationProps<Settings>) => {
    const [lastClick, setLastClick] = useState<string>("");
    const [lastHover, setLastHover] = useState<string>("");

    const { threshold } = settings;
    const [
      {
        data: { cols, rows },
      },
    ] = series;
    const value = rows[0][0];
    const column = cols[0];

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
      const click: ClickObject<Settings> = {
        value,
        column,
        event: event.nativeEvent,
        element: event.currentTarget,
        data: [{ col: column, value }],
        origin: { row: rows[0], cols },
      };
      onClick(click);
      setLastClick(String(value));
    };

    const handleHover = (event: React.MouseEvent<HTMLElement>) => {
      onHover({
        value,
        column,
        data: [{ key: String(column.display_name), value, col: column }],
        element: event.currentTarget,
      });
      setLastHover(String(value));
    };

    const handleHoverOut = () => {
      onHover(null);
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 16,
          fontFamily: "inherit",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>
          Custom viz rendered successfully
        </h2>
        <div>Threshold: {String(threshold)}</div>
        <div>Value: {String(value)}</div>
        <div data-testid="demo-viz-locale">Locale: {locale}</div>

        <button
          type="button"
          data-testid="demo-viz-click-target"
          onClick={handleClick}
          style={{
            alignSelf: "flex-start",
            padding: "4px 12px",
            border: "1px solid var(--mb-color-border)",
            borderRadius: 4,
            background: "var(--mb-color-background-secondary)",
            cursor: "pointer",
          }}
        >
          Click me
        </button>

        <div
          data-testid="demo-viz-hover-target"
          onMouseEnter={handleHover}
          onMouseLeave={handleHoverOut}
          style={{
            alignSelf: "flex-start",
            padding: "4px 12px",
            border: "1px dashed var(--mb-color-border)",
            borderRadius: 4,
          }}
        >
          Hover me
        </div>

        <div data-testid="demo-viz-last-click">Last click: {lastClick}</div>
        <div data-testid="demo-viz-last-hover">Last hover: {lastHover}</div>

        <img
          alt="thumbs"
          src={getAssetUrl("thumbs.svg")}
          style={{ width: 24, height: 24, alignSelf: "flex-start" }}
        />
      </div>
    );
  };

  return defineConfig<Settings>({
    id: "demo-viz",
    getName: () => "demo-viz",
    minSize: { width: 2, height: 2 },
    checkRenderable(series, settings) {
      if (series.length !== 1) {
        throw new Error("Only 1 series is supported");
      }
      const [
        {
          data: { cols, rows },
        },
      ] = series;
      if (cols.length !== 1) {
        throw new Error("Query results should only have 1 column");
      }
      if (rows.length !== 1) {
        throw new Error("Query results should only have 1 row");
      }
      if (typeof rows[0][0] !== "number") {
        throw new Error("Result is not a number");
      }
      if (typeof settings.threshold !== "number") {
        throw new Error("Threshold setting is not set");
      }
    },
    settings: {
      threshold: defineSetting({
        id: "threshold",
        title: "Threshold",
        widget: "number",
        getDefault() {
          return 0;
        },
        getProps() {
          return {
            options: { isInteger: false, isNonNegative: false },
            placeholder: "Set threshold",
          };
        },
      }),
    },
    VisualizationComponent,
  });
};

// IIFE wrapper expects the global to be the factory itself. The runtime
// sandbox's endowment captures this assignment and hands the value back
// to the host via `sandbox.evaluate(text)`.
declare const globalThis: { __customVizPlugin__: typeof factory };
globalThis.__customVizPlugin__ = factory;
