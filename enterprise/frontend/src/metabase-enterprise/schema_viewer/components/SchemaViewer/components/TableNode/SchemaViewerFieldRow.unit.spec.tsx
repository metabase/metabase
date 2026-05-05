import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";

import { getIcon, renderWithProviders, screen } from "__support__/ui";
import type { ConcreteTableId, ErdField } from "metabase-types/api";

import { SchemaViewerContext } from "../../SchemaViewerContext";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";

type ContextOverrides = {
  visibleTableIds?: Set<ConcreteTableId>;
  expandingTableIds?: Set<ConcreteTableId>;
  onExpandToTable?: jest.Mock;
  zoomToNode?: jest.Mock;
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
  const onExpandToTable = contextOverrides.onExpandToTable ?? jest.fn();
  const zoomToNode = contextOverrides.zoomToNode ?? jest.fn();
  const onSelectNode = jest.fn();

  const field: ErdField = {
    id: 10,
    name: "user_id",
    display_name: "User ID",
    database_type: "integer",
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
    onExpandToTable,
    selectedNodeId: null,
    onSelectNode,
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

  return { onExpandToTable, zoomToNode };
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
      ["bool", "io"],
      ["boolean", "io"],
      ["timestamp", "calendar"],
      ["date", "calendar"],
      ["time", "calendar"],
      ["integer", "int"],
      ["bigint", "int"],
      ["smallint", "int"],
      ["numeric", "int"],
      ["decimal", "int"],
      ["money", "int"],
      ["text", "string"],
      ["varchar", "string"],
      ["uuid", "string"],
      ["json", "string"],
      ["bytea", "string"],
      ["geometry", "unknown"],
    ])("maps database_type=%s to the `%s` icon", (dbType, icon) => {
      setup({ field: { database_type: dbType } });
      expect(getIcon(icon)).toBeInTheDocument();
    });
  });

  describe("click behavior", () => {
    it("clicking a plain non-FK field does not fire any handler", async () => {
      const onExpandToTable = jest.fn();
      const zoomToNode = jest.fn();
      setup({
        field: { semantic_type: null },
        context: { onExpandToTable, zoomToNode },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(onExpandToTable).not.toHaveBeenCalled();
      expect(zoomToNode).not.toHaveBeenCalled();
    });

    it("clicking an FK field with a null target (permission-filtered) does not fire any handler", async () => {
      const onExpandToTable = jest.fn();
      const zoomToNode = jest.fn();
      setup({
        field: {
          semantic_type: "type/FK",
          fk_target_table_id: null,
          fk_target_field_id: null,
        },
        context: { onExpandToTable, zoomToNode },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(onExpandToTable).not.toHaveBeenCalled();
      expect(zoomToNode).not.toHaveBeenCalled();
    });

    it("clicking an FK field whose target is off canvas calls onExpandToTable with both candidate edge ID orderings", async () => {
      const onExpandToTable = jest.fn();
      setup({
        field: {
          id: 10,
          semantic_type: "type/FK",
          fk_target_table_id: 99 as ConcreteTableId,
          fk_target_field_id: 999,
        },
        context: {
          visibleTableIds: new Set<ConcreteTableId>(),
          onExpandToTable,
        },
      });
      await userEvent.click(screen.getByText("user_id"));
      expect(onExpandToTable).toHaveBeenCalledWith(99, [
        "edge-10-999",
        "edge-999-10",
      ]);
    });

    it("clicking an FK field whose target is on canvas calls zoomToNode with `table-{targetId}`", async () => {
      const zoomToNode = jest.fn();
      setup({
        field: {
          id: 10,
          semantic_type: "type/FK",
          fk_target_table_id: 99 as ConcreteTableId,
          fk_target_field_id: 999,
        },
        context: {
          visibleTableIds: new Set([99 as ConcreteTableId]),
          zoomToNode,
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
          fk_target_table_id: 99 as ConcreteTableId,
          fk_target_field_id: 999,
          database_type: "integer",
        },
        context: {
          expandingTableIds: new Set([99 as ConcreteTableId]),
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
          fk_target_table_id: 99 as ConcreteTableId,
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
