import { removeOrphanSettings } from "./utils";

import {
  getDefaultFormSettings,
  getDefaultFieldSettings,
} from "metabase/writeback/components/ActionCreator/FormCreator/utils";

import type { Parameter as ParameterObject } from "metabase-types/types/Parameter";

describe("entities > actions > utils", () => {
  it("should remove orphan settings", () => {
    const formSettings = getDefaultFormSettings();
    formSettings.name = "test form";
    formSettings.fields.aaa = getDefaultFieldSettings();
    formSettings.fields.bbb = getDefaultFieldSettings();
    formSettings.fields.ccc = getDefaultFieldSettings();

    const parameters = [
      { id: "aaa", name: "foo" },
      { id: "ccc", name: "bar" },
    ] as ParameterObject[];

    const result = removeOrphanSettings(formSettings, parameters);

    expect(result.name).toEqual("test form");
    expect(result.fields).toHaveProperty("aaa");
    expect(result.fields).toHaveProperty("ccc");
    expect(result.fields).not.toHaveProperty("bbb");
  });

  it("should leave non-orphan settings intact", () => {
    const formSettings = getDefaultFormSettings();
    formSettings.name = "test form";

    formSettings.fields.aaa = getDefaultFieldSettings();
    formSettings.fields.bbb = getDefaultFieldSettings();
    formSettings.fields.ccc = getDefaultFieldSettings();

    const parameters = [
      { id: "aaa", name: "foo" },
      { id: "bbb", name: "foo" },
      { id: "ccc", name: "bar" },
    ] as ParameterObject[];

    const result = removeOrphanSettings(formSettings, parameters);

    expect(result.name).toEqual("test form");
    expect(result.fields).toHaveProperty("aaa");
    expect(result.fields).toHaveProperty("bbb");
    expect(result.fields).toHaveProperty("ccc");
  });
});
