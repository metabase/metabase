import {
  removeOrphanSettings,
  setParameterTypesFromFieldSettings,
} from "./utils";

import {
  getDefaultFormSettings,
  getDefaultFieldSettings,
} from "metabase/writeback/components/ActionCreator/FormCreator/utils";

import type { Parameter as ParameterObject } from "metabase-types/types/Parameter";

describe("entities > actions > utils", () => {
  describe("removeOrphanSettings", () => {
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

  describe("setParameterTypesFromFieldSettings", () => {
    it("should set string parameter types", () => {
      const formSettings = getDefaultFormSettings();
      formSettings.name = "test form";

      formSettings.fields.aaa = getDefaultFieldSettings();
      formSettings.fields.aaa.fieldType = "string";

      formSettings.fields.bbb = getDefaultFieldSettings();
      formSettings.fields.bbb.fieldType = "string";

      formSettings.fields.ccc = getDefaultFieldSettings();
      formSettings.fields.ccc.fieldType = "string";

      const parameters = [
        { id: "aaa", name: "foo", type: "number/=" },
        { id: "bbb", name: "foo", type: "number/=" },
        { id: "ccc", name: "bar", type: "number/=" },
      ] as ParameterObject[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("string/="));
    });

    it("should set number parameter types", () => {
      const formSettings = getDefaultFormSettings();
      formSettings.name = "test form";

      formSettings.fields.aaa = getDefaultFieldSettings();
      formSettings.fields.aaa.fieldType = "number";

      formSettings.fields.bbb = getDefaultFieldSettings();
      formSettings.fields.bbb.fieldType = "number";

      formSettings.fields.ccc = getDefaultFieldSettings();
      formSettings.fields.ccc.fieldType = "number";

      const parameters = [
        { id: "aaa", name: "foo", type: "string/=" },
        { id: "bbb", name: "foo", type: "string/=" },
        { id: "ccc", name: "bar", type: "string/=" },
      ] as ParameterObject[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("number/="));
    });

    it("should set date parameter types", () => {
      const formSettings = getDefaultFormSettings();
      formSettings.name = "test form";

      formSettings.fields.aaa = getDefaultFieldSettings();
      formSettings.fields.aaa.fieldType = "date";

      formSettings.fields.bbb = getDefaultFieldSettings();
      formSettings.fields.bbb.fieldType = "date";

      formSettings.fields.ccc = getDefaultFieldSettings();
      formSettings.fields.ccc.fieldType = "date";

      const parameters = [
        { id: "aaa", name: "foo", type: "string/=" },
        { id: "bbb", name: "foo", type: "string/=" },
        { id: "ccc", name: "bar", type: "string/=" },
      ] as ParameterObject[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("date/single"));
    });
  });
});
