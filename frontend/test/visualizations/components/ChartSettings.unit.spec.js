import React from "react";

import ChartSettings from "metabase/visualizations/components/ChartSettings";

import { TableCard } from "../__support__/visualizations";

import { mount } from "enzyme";
import { click } from "__support__/enzyme_utils";

function renderChartSettings(enabled = true) {
  const props = {
    series: [
      TableCard("Foo", {
        card: {
          visualization_settings: {
            "table.columns": [{ name: "Foo_col0", enabled: enabled }],
          },
        },
      }),
    ],
  };
  return mount(<ChartSettings {...props} onChange={() => {}} />);
}

// The ExplicitSize component uses the matchMedia DOM API
// which does not exist in jest's JSDOM
Object.defineProperty(window, "matchMedia", {
  value: jest.fn(() => {
    return {
      matches: true,
      addListener: () => {},
      removeListener: () => {},
    };
  }),
});

// We have to do some mocking here to avoid calls to GA and to Metabase settings
jest.mock("metabase/lib/settings", () => ({
  get: () => "v",
}));

describe("ChartSettings", () => {
  describe("toggling fields", () => {
    describe("disabling all fields", () => {
      it("should show null state", () => {
        const chartSettings = renderChartSettings();

        expect(chartSettings.find(".toggle-all .Icon-check").length).toEqual(1);
        expect(chartSettings.find("table").length).toEqual(1);

        click(chartSettings.find(".toggle-all .cursor-pointer"));

        expect(chartSettings.find(".toggle-all .Icon-check").length).toEqual(0);
        expect(chartSettings.find("table").length).toEqual(0);
        expect(chartSettings.text()).toContain(
          "Every field is hidden right now",
        );
      });
    });

    describe("enabling all fields", () => {
      it("should show all columns", () => {
        const chartSettings = renderChartSettings(false);

        expect(chartSettings.find(".toggle-all .Icon-check").length).toEqual(0);
        expect(chartSettings.find("table").length).toEqual(0);
        expect(chartSettings.text()).toContain(
          "Every field is hidden right now",
        );

        click(chartSettings.find(".toggle-all .cursor-pointer"));

        expect(chartSettings.find(".toggle-all .Icon-check").length).toEqual(1);
        expect(chartSettings.find("table").length).toEqual(1);
        expect(chartSettings.text()).not.toContain(
          "Every field is hidden right now",
        );
      });
    });
  });
});
