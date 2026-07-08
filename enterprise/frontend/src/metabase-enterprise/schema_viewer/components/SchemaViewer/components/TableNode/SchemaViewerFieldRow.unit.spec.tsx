import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import type { ConcreteTableId, ErdField } from "metabase-types/api";

import { SchemaViewerContext } from "../../SchemaViewerContext";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";

type ContextOverrides = {
  visibleTableIds?: Set<ConcreteTableId>;
  expandingTableIds?: Set<ConcreteTableId>;
};

type SetupOpts = {
  field?: Partial<ErdField>;
  isSource?: boolean;
  isTarget?: boolean;
  isSelfRefTarget?: boolean;
  isSelectedInEdge?: boolean;
  context?: ContextOverrides;
};

function setup({
  field: fieldOverrides = {},
  isSource = false,
  isTarget = false,
  isSelfRefTarget = false,
  isSelectedInEdge = false,
  context: contextOverrides = {},
}: SetupOpts = {}) {
  const expandToTable = jest.fn();
  const zoomToNode = jest.fn();
  const selectNode = jest.fn();

  const field: ErdField = {
    id: 10,
    name: "user_id",
    display_name: "User ID",
    database_type: "integer",
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: null,
    fk_target_field_id: null,
    fk_target_table_id: null,
    ...fieldOverrides,
  };

  const value = {
    visibleTableIds:
      contextOverrides.visibleTableIds ?? new Set<ConcreteTableId>(),
    expandingTableIds:
      contextOverrides.expandingTableIds ?? new Set<ConcreteTableId>(),
    expandToTable,
    selectedNodeId: null,
    selectNode,
    zoomToNode,
  };

  renderWithProviders(
    <ReactFlowProvider>
      <SchemaViewerContext.Provider value={value}>
        <SchemaViewerFieldRow
          field={field}
          isSource={isSource}
          isTarget={isTarget}
          isSelfRefTarget={isSelfRefTarget}
          isSelectedInEdge={isSelectedInEdge}
        />
      </SchemaViewerContext.Provider>
    </ReactFlowProvider>,
  );

  return { expandToTable, zoomToNode };
}

describe("SchemaViewerFieldRow", () => {
  describe("icon mapping", () => {
    it("uses the `label` icon for primary keys", () => {
      setup({ field: { semantic_type: "type/PK" } });
      expect(getIcon("label")).toBeInTheDocument();
    });

    it("uses the `connections` icon for foreign keys", () => {
      setup({ field: { semantic_type: "type/FK", fk_target_table_id: 99 } });
      expect(getIcon("connections")).toBeInTheDocument();
    });

    it.each<[string, string]>([
      ["type/Boolean", "io"],
      ["type/DateTime", "calendar"],
      ["type/Date", "calendar"],
      ["type/Time", "calendar"],
      ["type/Integer", "int"],
      ["type/BigInteger", "int"],
      ["type/Float", "int"],
      ["type/Decimal", "int"],
      ["type/Text", "string"],
    ])("maps base_type=%s to the `%s` icon", (baseType, icon) => {
      setup({ field: { base_type: baseType, effective_type: baseType } });
      expect(getIcon(icon)).toBeInTheDocument();
    });

    it("falls back to the `list` icon for unrecognized types", () => {
      setup({
        field: {
          base_type: "type/Structured",
          effective_type: "type/Structured",
        },
      });
      expect(getIcon("list")).toBeInTheDocument();
    });
  });

  describe("click behavior", () => {
    it("clicking a plain non-FK field does not fire any handler", async () => {
      const { expandToTable, zoomToNode } = setup({
        field: { semantic_type: null },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(expandToTable).not.toHaveBeenCalled();
      expect(zoomToNode).not.toHaveBeenCalled();
    });

    it("clicking an FK field with a null target (permission-filtered) does not fire any handler", async () => {
      const { expandToTable, zoomToNode } = setup({
        field: {
          semantic_type: "type/FK",
          fk_target_table_id: null,
          fk_target_field_id: null,
        },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(expandToTable).not.toHaveBeenCalled();
      expect(zoomToNode).not.toHaveBeenCalled();
    });

    it("clicking an FK field whose target is off canvas calls onExpandToTable with both candidate edge ID orderings", async () => {
      const { expandToTable } = setup({
        field: {
          id: 10,
          semantic_type: "type/FK",
          fk_target_table_id: 99,
          fk_target_field_id: 999,
        },
        context: {
          visibleTableIds: new Set<ConcreteTableId>(),
        },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(expandToTable).toHaveBeenCalledWith(99, [
        "edge-10-999",
        "edge-999-10",
      ]);
    });

    it("clicking an FK field whose target is on canvas calls zoomToNode with `table-{targetId}`", async () => {
      const { zoomToNode } = setup({
        field: {
          id: 10,
          semantic_type: "type/FK",
          fk_target_table_id: 99,
          fk_target_field_id: 999,
        },
        context: {
          visibleTableIds: new Set([99]),
        },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(zoomToNode).toHaveBeenCalledWith("table-99");
    });
  });

  describe("expand-in-flight loader", () => {
    it("renders a Loader instead of the db type when target is in expandingTableIds", () => {
      setup({
        field: {
          semantic_type: "type/FK",
          fk_target_table_id: 99,
          fk_target_field_id: 999,
          database_type: "integer",
        },
        context: {
          expandingTableIds: new Set([99]),
        },
      });
      expect(screen.queryByText("integer")).not.toBeInTheDocument();
      expect(
        screen.getByTestId("schema-viewer-field-row-loader"),
      ).toBeInTheDocument();
    });

    it("does not render the loader when target is not in expandingTableIds", () => {
      setup({
        field: {
          semantic_type: "type/FK",
          fk_target_table_id: 99,
          fk_target_field_id: 999,
          database_type: "integer",
        },
        context: {
          expandingTableIds: new Set<ConcreteTableId>(),
        },
      });
      expect(screen.getByText("integer")).toBeInTheDocument();
      expect(
        screen.queryByTestId("schema-viewer-field-row-loader"),
      ).not.toBeInTheDocument();
    });
  });
});
