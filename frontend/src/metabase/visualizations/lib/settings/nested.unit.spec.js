import { getComputedSettings } from "metabase/visualizations/lib/settings";
import { nestedSettings } from "metabase/visualizations/lib/settings/nested";

describe("nestedSettings", () => {
  it("should add a nested setting function to settings", () => {
    const defs = {
      ...nestedSettings("nested_settings", {
        objectName: "nested",
        getObjects: () => [1, 2, 3],
        getObjectKey: object => String(object),
        getObjectSettings: (objects, key) => objects[key],
        getSettingDefinitionsForObject: () => ({
          foo: { getDefault: object => `foo${object}` },
        }),
      }),
    };
    const stored = { nested_settings: { 1: { foo: "bar" } } };
    const settings = getComputedSettings(defs, null, stored);
    expect(settings.nested(1)).toEqual({ foo: "bar" });
    expect(settings.nested(2)).toEqual({ foo: "foo2" });

    delete settings.nested;
    expect(settings).toEqual({
      nested: undefined,
      nested_settings: { 1: { foo: "bar" } },
    });
  });
});
