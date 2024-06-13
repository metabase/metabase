import BarChart from "./BarChart";

describe("BarChart", () => {
  describe("onDisplayUpdate", () => {
    it("should set to area if the setting exists", () => {
      const settings = { "stackable.stack_display": "area" };
      const frozenSettings = Object.freeze(settings);

      const expectedSettings = { "stackable.stack_display": "bar" };

      expect(BarChart.onDisplayUpdate(settings)).toStrictEqual(
        expectedSettings,
      );
      expect(BarChart.onDisplayUpdate(frozenSettings)).toStrictEqual(
        expectedSettings,
      );
    });
  });
});
