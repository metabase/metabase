import { getDefaultFieldSettings } from "metabase/actions/utils";
import type { FieldSettingsMap } from "metabase-types/api";

import { reorderFields } from "./utils";

describe("actions > containers > ActionCreator > FormCreator > utils", () => {
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
});
