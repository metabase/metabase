import {
  getDefaultFormSettings,
  getDefaultFieldSettings,
} from "metabase/actions/utils";

import type {
  NativeDatasetQuery,
  Parameter,
  TemplateTagType,
} from "metabase-types/api";
import { getUnsavedNativeQuestion } from "metabase-lib/mocks";

import {
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

describe("actions > containers > ActionCreator > QueryActionContextProvider > utils", () => {
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
        question,
        formSettings,
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
        question,
        formSettings,
      );

      const tags = (newQuestion.card().dataset_query as NativeDatasetQuery)
        .native["template-tags"];

      expect(tags?.name.type).toEqual("date");
      expect(tags?.price.type).toEqual("date");
    });
  });
});
