import React from "react";

import ChartSettingOrderedFields from "metabase/visualizations/components/settings/ChartSettingOrderedFields";

import { mount } from "enzyme";

function renderChartSettingOrderedFields(props) {
  return mount(<ChartSettingOrderedFields {...props} onChange={() => {}} />);
}

describe("ChartSettingOrderedFields", () => {
  describe("isAnySelected", () => {
    describe("when on or more fields are enabled", () => {
      it("should be true", () => {
        const chartSettings = renderChartSettingOrderedFields({
          columnNames: { id: "ID", text: "Text" },
          value: [
            { name: "id", enabled: true },
            { name: "text", enabled: false },
          ],
        });
        expect(chartSettings.instance().isAnySelected()).toEqual(true);
      });
    });

    describe("when no fields are enabled", () => {
      it("should be false", () => {
        const chartSettings = renderChartSettingOrderedFields({
          columnNames: { id: "ID", text: "Text" },
          value: [
            { name: "id", enabled: false },
            { name: "text", enabled: false },
          ],
        });
        expect(chartSettings.instance().isAnySelected()).toEqual(false);
      });
    });
  });

  describe("toggleAll", () => {
    describe("when passed false", () => {
      it("should mark all fields as enabled", () => {
        const chartSettings = renderChartSettingOrderedFields({
          columnNames: { id: "ID", text: "Text" },
          value: [
            { name: "id", enabled: false },
            { name: "text", enabled: false },
          ],
        });
        const chartSettingsInstance = chartSettings.instance();
        chartSettingsInstance.toggleAll(false);
        expect(chartSettingsInstance.state.data.items).toEqual([
          { name: "id", enabled: true },
          { name: "text", enabled: true },
        ]);
      });
    });

    describe("when passed true", () => {
      it("should mark all fields as disabled", () => {
        const chartSettings = renderChartSettingOrderedFields({
          columnNames: { id: "ID", text: "Text" },
          value: [
            { name: "id", enabled: true },
            { name: "text", enabled: true },
          ],
        });

        const chartSettingsInstance = chartSettings.instance();
        chartSettingsInstance.toggleAll(true);
        expect(chartSettingsInstance.state.data.items).toEqual([
          { name: "id", enabled: false },
          { name: "text", enabled: false },
        ]);
      });
    });
  });
});
