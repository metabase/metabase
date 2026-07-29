import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/utils/types";
import type { ConcreteTableId } from "metabase-types/api";

import { SchemaViewerContext } from "../../SchemaViewerContext";
import type { SchemaViewerFlowNode } from "../../types";
import { type FlowNodeFieldSpec, makeFlowNode } from "../../utils/test-utils";

import { SchemaViewerNodeSearch } from "./SchemaViewerNodeSearch";

// NodeSearch only reads a node's id, name, and field list — the size/opacity
// values just need to look like a rendered node, hence the fixed style.
function makeNode(
  id: number,
  name: string,
  fields: FlowNodeFieldSpec[] = [],
): SchemaViewerFlowNode {
  return makeFlowNode({
    id,
    name,
    fields,
    width: 320,
    height: 200,
    opacity: 1,
  });
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
}: SetupOpts = {}) {
  const zoomToNode = jest.fn();
  const value = {
    visibleTableIds: new Set<ConcreteTableId>(),
    expandingTableIds: new Set<ConcreteTableId>(),
    expandToTable: jest.fn(),
    selectedNodeId: null,
    selectNode: jest.fn(),
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
    const productsOption = options.find((opt) =>
      within(opt).queryByText("PRODUCTS"),
    );
    expect(
      within(checkNotNull(ordersOption)).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(checkNotNull(reviewsOption)).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(checkNotNull(productsOption)).getByText("0"),
    ).toBeInTheDocument();
  });

  it("selecting an option calls zoomToNode and closes the dropdown", async () => {
    const { zoomToNode } = setup();
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

  it("'f' key focuses the input and opens the dropdown", async () => {
    setup();
    const input = screen.getByPlaceholderText(/Jump to table/i);
    expect(input).not.toHaveFocus();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await userEvent.keyboard("f");

    expect(input).toHaveFocus();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });
});
