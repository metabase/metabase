import {
  getDefaultFormSettings,
  getDefaultFieldSettings,
} from "metabase/writeback/components/ActionCreator/FormCreator/utils";

import { metadata } from "__support__/sample_database_fixture";
import type { Parameter as ParameterObject } from "metabase-types/types/Parameter";
import { NativeDatasetQuery } from "metabase-types/types/Card";
import { ModelAction } from "metabase-types/api";
import Question from "metabase-lib/lib/Question";

import {
  removeOrphanSettings,
  setParameterTypesFromFieldSettings,
  setTemplateTagTypesFromFieldSettings,
  mapModelActionsToActions,
} from "./utils";

const creatQuestionWithTemplateTags = (tagType: string) =>
  new Question(
    {
      dataset_query: {
        type: "native",
        database: null,
        native: {
          query:
            "INSERT INTO products (name, price) VALUES ({{name}}, {{price}});",
          "template-tags": {
            name: {
              id: "aaa",
              name: "name",
              type: tagType,
            },
            price: {
              id: "bbb",
              name: "price",
              type: tagType,
            },
          },
        },
      },
    },
    metadata,
  );

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
      ] as ParameterObject[];

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
      ] as ParameterObject[];

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
      ] as ParameterObject[];

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
      ] as ParameterObject[];

      const newParams = setParameterTypesFromFieldSettings(
        formSettings,
        parameters,
      );

      newParams.forEach(param => expect(param.type).toEqual("date/single"));
    });
  });

  describe("setTemplateTagTypesFromFieldSettings", () => {
    it("should set text and number template tag types", () => {
      const question = creatQuestionWithTemplateTags("date");

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

      expect(tags.name.type).toEqual("text");
      expect(tags.price.type).toEqual("number");
    });

    it("should set date template tag types", () => {
      const question = creatQuestionWithTemplateTags("number");

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

      expect(tags.name.type).toEqual("date");
      expect(tags.price.type).toEqual("date");
    });
  });

  describe("mapModelActionsToAction", () => {
    it("puts action_id into the id property", () => {
      const modelAction = {
        id: 123,
        card_id: 456,
        action_id: 789,
        slug: "slug_name",
        name: "Action Name",
      };

      const action = mapModelActionsToActions(modelAction as ModelAction);

      expect(action.id).toEqual(789);
      expect(action.model_action_id).toEqual(123);
      expect(action.name).toEqual("Action Name");
    });

    it("preserves name property", () => {
      const modelAction = {
        id: 123,
        card_id: 456,
        action_id: 789,
        slug: "slug_name",
        name: "Action Name",
      };

      const action = mapModelActionsToActions(modelAction as ModelAction);

      expect(action.name).toEqual("Action Name");
    });
  });
});
