import { prepareAnalyticsValue } from "metabase/admin/settings/utils";

describe("prepareAnalyticsValue", () => {
  const defaultSetting = { value: 120, type: "number" };

  it("should return a non identifying value by default", () => {
    expect(prepareAnalyticsValue(defaultSetting)).toBe("success");
  });

  it("should return the value of a setting marked collectable", () => {
    expect(
      prepareAnalyticsValue({ ...defaultSetting, allowValueCollection: true }),
    ).toBe(defaultSetting.value);
  });

  it('should return the value of a setting with a type of "boolean" collectable', () => {
    expect(prepareAnalyticsValue({ ...defaultSetting, type: "boolean" })).toBe(
      defaultSetting.value,
    );
  });
});
