import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { ConcreteTableId } from "metabase-types/api";

import { SchemaViewerContext } from "../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../types";

import { SchemaViewerNodeSearch } from "./SchemaViewerNodeSearch";

function makeNode(
  id: number,
  name: string,
  fields: Array<{ name: string; isFK?: boolean }> = [],
): SchemaViewerFlowNode {
  return {
    id: `table-${id}`,
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    data: {
      table_id: id,
      name,
      display_name: name,
      schema: "public",
      db_id: 1,
      fields: fields.map((f, i) => ({
        id: i + 1,
        name: f.name,
        display_name: f.name,
        database_type: "text",
        semantic_type: f.isFK ? "type/FK" : null,
        fk_target_field_id: null,
        fk_target_table_id: null,
      })),
      sourceFieldIds: new Set<number>(),
      targetFieldIds: new Set<number>(),
      selfRefTargetFieldIds: new Set<number>(),
    },
    style: { width: 320, height: 200, opacity: 1 },
  };
}

type SetupOpts = {
  nodes?: SchemaViewerFlowNode[];
  zoomToNode?: jest.Mock;
};

function setup({
  nodes = [
    makeNode(1, "ORDERS", [{ name: "user_id", isFK: true }, { name: "qty" }]),
    makeNode(2, "PRODUCTS"),
    makeNode(3, "REVIEWS", [{ name: "order_id", isFK: true }]),
  ],
  zoomToNode = jest.fn(),
}: SetupOpts = {}) {
  const value = {
    visibleTableIds: new Set<ConcreteTableId>(),
    expandingTableIds: new Set<ConcreteTableId>(),
    onExpandToTable: jest.fn(),
    selectedNodeId: null,
    onSelectNode: jest.fn(),
    zoomToNode,
  };

  const utils = renderWithProviders(
    <SchemaViewerContext.Provider value={value}>
      <SchemaViewerNodeSearch nodes={nodes} />
    </SchemaViewerContext.Provider>,
  );

  return { ...utils, zoomToNode };
}

describe("SchemaViewerNodeSearch", () => {
  it("renders no search input when there are no nodes", () => {
    setup({ nodes: [] });
    expect(
      screen.queryByPlaceholderText(/Jump to table/i),
    ).not.toBeInTheDocument();
  });

  it("renders the search input when nodes exist", () => {
    setup();
    expect(screen.getByPlaceholderText(/Jump to table/i)).toBeInTheDocument();
  });

  it("filters options by name (case-insensitive substring)", async () => {
    setup();
    await userEvent.click(screen.getByPlaceholderText(/Jump to table/i));
    await userEvent.type(screen.getByPlaceholderText(/Jump to table/i), "ord");
    expect(screen.getByText("ORDERS")).toBeInTheDocument();
    expect(screen.queryByText("PRODUCTS")).not.toBeInTheDocument();
  });

  it("shows 'No tables found' when no option matches", async () => {
    setup();
    await userEvent.click(screen.getByPlaceholderText(/Jump to table/i));
    await userEvent.type(
      screen.getByPlaceholderText(/Jump to table/i),
      "zzz_no_match",
    );
    expect(screen.getByText("No tables found")).toBeInTheDocument();
  });

  it("each option shows the FK count", async () => {
    setup();
    await userEvent.click(screen.getByPlaceholderText(/Jump to table/i));
    // ORDERS has 1 FK; REVIEWS has 1 FK; PRODUCTS has 0 — the FK count
    // appears as text inside the same option row as the table name.
    const options = screen.getAllByRole("option");
    const ordersOption = options.find((opt) =>
      within(opt).queryByText("ORDERS"),
    );
    const reviewsOption = options.find((opt) =>
      within(opt).queryByText("REVIEWS"),
    );
    expect(ordersOption).toBeDefined();
    expect(reviewsOption).toBeDefined();
    expect(within(ordersOption!).getByText("1")).toBeInTheDocument();
    expect(within(reviewsOption!).getByText("1")).toBeInTheDocument();
  });

  it("selecting an option calls zoomToNode and closes the dropdown", async () => {
    const zoomToNode = jest.fn();
    setup({ zoomToNode });
    await userEvent.click(screen.getByPlaceholderText(/Jump to table/i));
    await userEvent.click(screen.getByText("ORDERS"));
    expect(zoomToNode).toHaveBeenCalledWith("table-1");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("Esc closes the dropdown", async () => {
    setup();
    const input = screen.getByPlaceholderText(/Jump to table/i);
    await userEvent.click(input);
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    await userEvent.type(input, "{Escape}");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });
});
