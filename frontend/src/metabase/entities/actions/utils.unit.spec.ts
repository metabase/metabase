import {
  getDefaultFormSettings,
  getDefaultFieldSettings,
} from "metabase/actions/utils";

import type { Parameter } from "metabase-types/api";
import type { NativeDatasetQuery } from "metabase-types/types/Card";
import type { TemplateTagType } from "metabase-types/types/Query";
import { getUnsavedNativeQuestion } from "metabase-lib/mocks";

import {
  removeOrphanSettings,
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
} from "./utils";

const createQuestionWithTemplateTags = (tagType: TemplateTagType) =>
  getUnsavedNativeQuestion({
    dataset_query: {
      type: "native",
      database: 1,
      native: {
        query:
          "INSERT INTO products (name, price) VALUES ({{name}}, {{price}});",
        "template-tags": {
          name: {
            id: "aaa",
            name: "name",
            "display-name": "Name",
            type: tagType,
          },
          price: {
            id: "bbb",
            name: "price",
            "display-name": "Price",
            type: tagType,
          },
        },
      },
    },
  });

describe("entities > actions > utils", () => {
  describe("removeOrphanSettings", () => {
    it("should remove orphan settings", () => {
      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings(),
          bbb: getDefaultFieldSettings(),
          ccc: getDefaultFieldSettings(),
        },
      });

      const parameters = [
        { id: "aaa", name: "foo" },
        { id: "ccc", name: "bar" },
      ] as Parameter[];

      const result = removeOrphanSettings(formSettings, parameters);

      expect(result.name).toEqual("test form");
      expect(result.fields).toHaveProperty("aaa");
      expect(result.fields).toHaveProperty("ccc");
      expect(result.fields).not.toHaveProperty("bbb");
    });

    it("should leave non-orphan settings intact", () => {
      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings(),
          bbb: getDefaultFieldSettings(),
          ccc: getDefaultFieldSettings(),
        },
      });

      const parameters = [
        { id: "aaa", name: "foo" },
        { id: "bbb", name: "foo" },
        { id: "ccc", name: "bar" },
      ] as Parameter[];

      const result = removeOrphanSettings(formSettings, parameters);

      expect(result.name).toEqual("test form");
      expect(result.fields).toHaveProperty("aaa");
      expect(result.fields).toHaveProperty("bbb");
      expect(result.fields).toHaveProperty("ccc");
    });
  });

  describe("setParameterTypesFromFieldSettings", () => {
    it("should set string parameter types", () => {
      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings({ fieldType: "string" }),
          bbb: getDefaultFieldSettings({ fieldType: "string" }),
          ccc: getDefaultFieldSettings({ fieldType: "string" }),
        },
      });

      const parameters = [
        { id: "aaa", name: "foo", type: "number/=" },
        { id: "bbb", name: "foo", type: "number/=" },
        { id: "ccc", name: "bar", type: "number/=" },
      ] as Parameter[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("string/="));
    });

    it("should set number parameter types", () => {
      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings({ fieldType: "number" }),
          bbb: getDefaultFieldSettings({ fieldType: "number" }),
          ccc: getDefaultFieldSettings({ fieldType: "number" }),
        },
      });

      const parameters = [
        { id: "aaa", name: "foo", type: "string/=" },
        { id: "bbb", name: "foo", type: "string/=" },
        { id: "ccc", name: "bar", type: "string/=" },
      ] as Parameter[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("number/="));
    });

    it("should set date parameter types", () => {
      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings({ fieldType: "date" }),
          bbb: getDefaultFieldSettings({ fieldType: "date" }),
          ccc: getDefaultFieldSettings({ fieldType: "date" }),
        },
      });

      const parameters = [
        { id: "aaa", name: "foo", type: "string/=" },
        { id: "bbb", name: "foo", type: "string/=" },
        { id: "ccc", name: "bar", type: "string/=" },
      ] as Parameter[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("date/single"));
    });
  });

  describe("setTemplateTagTypesFromFieldSettings", () => {
    it("should set text and number template tag types", () => {
      const question = createQuestionWithTemplateTags("date");

      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings({ fieldType: "string" }),
          bbb: getDefaultFieldSettings({ fieldType: "number" }),
        },
      });

      const newQuestion = setTemplateTagTypesFromFieldSettings(
        formSettings,
        question,
      );

      const tags = (newQuestion.card().dataset_query as NativeDatasetQuery)
        .native["template-tags"];

      expect(tags?.name.type).toEqual("text");
      expect(tags?.price.type).toEqual("number");
    });

    it("should set date template tag types", () => {
      const question = createQuestionWithTemplateTags("number");

      const formSettings = getDefaultFormSettings({
        name: "test form",
        fields: {
          aaa: getDefaultFieldSettings({ fieldType: "date" }),
          bbb: getDefaultFieldSettings({ fieldType: "date" }),
        },
      });

      const newQuestion = setTemplateTagTypesFromFieldSettings(
        formSettings,
        question,
      );

      const tags = (newQuestion.card().dataset_query as NativeDatasetQuery)
        .native["template-tags"];

      expect(tags?.name.type).toEqual("date");
      expect(tags?.price.type).toEqual("date");
    });
  });
});
