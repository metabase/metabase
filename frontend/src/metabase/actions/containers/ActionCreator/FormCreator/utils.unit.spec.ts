import type { FieldSettingsMap } from "metabase-types/api";

import {
  getDefaultFieldSettings,
  getDefaultFormSettings,
} from "../../../utils";
import { reorderFields, hasNewParams } from "./utils";

const createParameter = (options?: any) => {
  return {
    id: "test_parameter",
    name: "Test Parameter",
    type: "type/Text",
    ...options,
  };
};

describe("actions > ActionCreator > FormCreator > utils", () => {
  describe("reorderFields", () => {
    it("should reorder fields", () => {
      const fields = {
        a: getDefaultFieldSettings({ order: 0 }),
        b: getDefaultFieldSettings({ order: 1 }),
        c: getDefaultFieldSettings({ order: 2 }),
      } as FieldSettingsMap;
      // move b to index 0
      const reorderedFields = reorderFields(fields, 1, 0);
      expect(reorderedFields.a.order).toEqual(1);
      expect(reorderedFields.b.order).toEqual(0);
      expect(reorderedFields.c.order).toEqual(2);
    });
  });

  describe("hasNewParams", () => {
    const formSettings = getDefaultFormSettings({
      fields: {
        a: getDefaultFieldSettings({ order: 0 }),
        b: getDefaultFieldSettings({ order: 1 }),
        c: getDefaultFieldSettings({ order: 2 }),
      },
    });

    it("should return true if there are new params", () => {
      const params = [
        createParameter({ id: "a" }),
        createParameter({ id: "b" }),
        createParameter({ id: "new" }),
      ];

      expect(hasNewParams(params, formSettings)).toBe(true);
    });

    it("should return false if there are no new params", () => {
      const params = [
        createParameter({ id: "a" }),
        createParameter({ id: "b" }),
        createParameter({ id: "c" }),
      ];

      expect(hasNewParams(params, formSettings)).toBe(false);
    });
  });
});
