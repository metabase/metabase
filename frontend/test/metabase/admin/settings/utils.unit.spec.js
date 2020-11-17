import { prepareAnalyticsValue } from "metabase/admin/settings/utils";

describe("prepareAnalyticsValue", () => {
  const defaultSetting = { value: 120, type: "number" };

  const checkResult = (setting = defaultSetting, expected = "success") =>
    expect(prepareAnalyticsValue(setting)).toEqual(expected);

  it("should return a non identifying value by default ", () => {
    checkResult();
  });

  it("should return the value of a setting marked collectable", () => {
    checkResult(
      { ...defaultSetting, allowValueCollection: true },
      defaultSetting.value,
    );
  });

  it('should return the value of a setting with a type of "boolean" collectable', () => {
    checkResult({ ...defaultSetting, type: "boolean" }, defaultSetting.value);
  });
});
