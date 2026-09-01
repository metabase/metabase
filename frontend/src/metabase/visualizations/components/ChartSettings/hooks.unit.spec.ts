import { renderHook } from "@testing-library/react";

import { registerVisualization } from "metabase/visualizations";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Series, VisualizationSettings } from "metabase-types/api";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import { useChartSettingsState } from "./hooks";

registerVisualizations();

const PREFIX = "custom-viz:demo-viz:";

interface SetupOpts {
  series: Series;
  settings?: VisualizationSettings;
}

const setup = ({ series, settings }: SetupOpts) => {
  const onChange = jest.fn();

  const { result } = renderHook(() =>
    useChartSettingsState({ series, settings, onChange }),
  );

  return { result, onChange };
};

describe("useChartSettingsState", () => {
  beforeAll(() => {
    registerVisualization({
      identifier: "custom:demo-viz",
      getUiName: () => "Demo viz",
      checkRenderable: () => undefined,
      settings: {
        [`${PREFIX}threshold`]: { widget: "number" },
      },
    });
  });

  it("uses the settings prop when given", () => {
    const series = [
      createMockSingleSeries({ visualization_settings: { threshold: 5 } }),
    ];
    const settings = { "graph.goal_value": 2 };

    const { result } = setup({ series, settings });

    expect(result.current.chartSettings).toBe(settings);
  });

  it("falls back to the card's stored settings", () => {
    const series = [
      createMockSingleSeries({
        display: "table",
        visualization_settings: { "graph.goal_value": 1 },
      }),
    ];

    const { result } = setup({ series });

    expect(result.current.chartSettings).toBe(
      series[0].card.visualization_settings,
    );
  });

  it("keeps a non-custom display's stored settings untouched (no renormalization)", () => {
    const series = [
      createMockSingleSeries({
        display: "table",
        visualization_settings: {
          column_settings: {
            '["ref",["field",1,null]]': { column_title: "One" },
          },
        },
      }),
    ];

    const { result } = setup({ series });

    expect(result.current.chartSettings).toBe(
      series[0].card.visualization_settings,
    );
  });

  it("reads a legacy non-namespaced custom viz key under its namespaced key", () => {
    const series = [
      createMockSingleSeries({
        display: "custom:demo-viz",
        visualization_settings: { threshold: 5 },
      }),
    ];

    const { result } = setup({ series });

    expect(result.current.chartSettings).toEqual({
      [`${PREFIX}threshold`]: 5,
    });
  });

  it("writes from the normalized settings, so the first edit drops a legacy non-namespaced custom viz key", () => {
    const series = [
      createMockSingleSeries({
        display: "custom:demo-viz",
        visualization_settings: { threshold: 5 },
      }),
    ];

    const { result, onChange } = setup({ series });
    result.current.handleChangeSettings({ "card.title": "Title" });

    expect(onChange).toHaveBeenCalledWith(
      { [`${PREFIX}threshold`]: 5, "card.title": "Title" },
      undefined,
    );
  });

  it("re-runs the migration once the plugin registers after the first render", () => {
    const series = [
      createMockSingleSeries({
        display: "custom:late-viz",
        visualization_settings: { threshold: 5 },
      }),
    ];

    const { result, rerender } = renderHook(() =>
      useChartSettingsState({ series, onChange: jest.fn() }),
    );

    expect(result.current.chartSettings).toEqual({ threshold: 5 });

    registerVisualization({
      identifier: "custom:late-viz",
      getUiName: () => "Late viz",
      checkRenderable: () => undefined,
      settings: {
        "custom-viz:late-viz:threshold": { widget: "number" },
      },
    });

    rerender();

    expect(result.current.chartSettings).toEqual({
      "custom-viz:late-viz:threshold": 5,
    });
  });
});
