import AreaChart from "./AreaChart";

describe("AreaChart", () => {
  describe("onDisplayUpdate", () => {
    it("should set to area if the setting exists", () => {
      const settings = { "stackable.stack_display": "bar" };
      const frozenSettings = Object.freeze(settings);

      const expectedSettings = { "stackable.stack_display": "area" };

      expect(AreaChart.onDisplayUpdate(settings)).toStrictEqual(
        expectedSettings,
      );
      expect(AreaChart.onDisplayUpdate(frozenSettings)).toStrictEqual(
        expectedSettings,
      );
    });
  });
});
