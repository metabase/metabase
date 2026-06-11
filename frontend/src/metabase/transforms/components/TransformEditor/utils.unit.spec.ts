import { createMockDatabase } from "metabase-types/api/mocks";

import { getEditorOptions } from "./utils";

const DB_ROUTING_TOOLTIP =
  "Transforms can't be enabled when database routing is enabled.";
const UNSUPPORTED_DB_TOOLTIP = "Transforms can't be enabled on this database.";

function createTransformCapableDatabase(opts = {}) {
  return createMockDatabase({
    features: ["transforms/table"],
    router_user_attribute: null,
    router_database_id: null,
    ...opts,
  });
}

describe("getEditorOptions", () => {
  describe("getDataPickerItemTooltip", () => {
    it("returns a tooltip for a database item with DB routing enabled via router_user_attribute", () => {
      const database = createTransformCapableDatabase({
        id: 1,
        router_user_attribute: "tenant_id",
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "database",
        id: 1,
        name: "Routed DB",
      });

      expect(tooltip).toBe(DB_ROUTING_TOOLTIP);
    });

    it("returns a tooltip for a database item with DB routing enabled via router_database_id", () => {
      const database = createTransformCapableDatabase({
        id: 2,
        router_database_id: 99,
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "database",
        id: 2,
        name: "Routing Destination DB",
      });

      expect(tooltip).toBe(DB_ROUTING_TOOLTIP);
    });

    it("returns a tooltip for a database that does not support transforms", () => {
      const database = createMockDatabase({ id: 3, features: [] });
      const options = getEditorOptions([database]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "database",
        id: 3,
        name: "H2 DB",
      });

      expect(tooltip).toBe(UNSUPPORTED_DB_TOOLTIP);
    });

    it("returns undefined for a transform-capable database", () => {
      const database = createTransformCapableDatabase({ id: 4 });
      const options = getEditorOptions([database]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "database",
        id: 4,
        name: "Normal DB",
      });

      expect(tooltip).toBeUndefined();
    });

    it("returns undefined for an unknown database id", () => {
      const database = createMockDatabase({ id: 1 });
      const options = getEditorOptions([database]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "database",
        id: 999,
        name: "Unknown DB",
      });

      expect(tooltip).toBeUndefined();
    });

    it("returns a tooltip for a table item whose database has DB routing", () => {
      const database = createTransformCapableDatabase({
        id: 5,
        router_user_attribute: "org_id",
      });
      const options = getEditorOptions([database]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "table",
        id: 10,
        database_id: 5,
        name: "My Table",
      });

      expect(tooltip).toBe(DB_ROUTING_TOOLTIP);
    });

    it("returns undefined for dashboard items", () => {
      const options = getEditorOptions([]);

      const tooltip = options.getDataPickerItemTooltip?.({
        model: "dashboard",
        id: 1,
        name: "My Dashboard",
      });

      expect(tooltip).toBeUndefined();
    });
  });
});
