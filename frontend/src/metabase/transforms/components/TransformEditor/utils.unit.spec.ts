import { createMockDatabase } from "metabase-types/api/mocks";

import { getEditorOptions } from "./utils";

const DB_ROUTING_TOOLTIP =
  "Transforms can't be created on databases with DB routing enabled";

describe("getEditorOptions", () => {
  describe("getDisabledDataPickerItemTooltip", () => {
    it("returns a tooltip for a database item with DB routing enabled via router_user_attribute", () => {
      const database = createMockDatabase({
        id: 1,
        router_user_attribute: "tenant_id",
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDisabledDataPickerItemTooltip?.({
        model: "database",
        id: 1,
        name: "Routed DB",
      });

      expect(tooltip).toBe(DB_ROUTING_TOOLTIP);
    });

    it("returns a tooltip for a database item with DB routing enabled via router_database_id", () => {
      const database = createMockDatabase({
        id: 2,
        router_database_id: 99,
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDisabledDataPickerItemTooltip?.({
        model: "database",
        id: 2,
        name: "Routing Destination DB",
      });

      expect(tooltip).toBe(DB_ROUTING_TOOLTIP);
    });

    it("returns undefined for a regular (non-routing) database item", () => {
      const database = createMockDatabase({
        id: 3,
        router_user_attribute: null,
        router_database_id: null,
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDisabledDataPickerItemTooltip?.({
        model: "database",
        id: 3,
        name: "Normal DB",
      });

      expect(tooltip).toBeUndefined();
    });

    it("returns undefined for an unknown database id", () => {
      const database = createMockDatabase({ id: 1 });
      const options = getEditorOptions([database]);

      const tooltip = options.getDisabledDataPickerItemTooltip?.({
        model: "database",
        id: 999,
        name: "Unknown DB",
      });

      expect(tooltip).toBeUndefined();
    });

    it("returns a tooltip for a table item whose database has DB routing", () => {
      const database = createMockDatabase({
        id: 5,
        router_user_attribute: "org_id",
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDisabledDataPickerItemTooltip?.({
        model: "table",
        id: 10,
        database_id: 5,
        name: "My Table",
      });

      expect(tooltip).toBe(DB_ROUTING_TOOLTIP);
    });

    it("returns undefined for dashboard items", () => {
      const options = getEditorOptions([]);

      const tooltip = options.getDisabledDataPickerItemTooltip?.({
        model: "dashboard",
        id: 1,
        name: "My Dashboard",
      });

      expect(tooltip).toBeUndefined();
    });
  });
});
