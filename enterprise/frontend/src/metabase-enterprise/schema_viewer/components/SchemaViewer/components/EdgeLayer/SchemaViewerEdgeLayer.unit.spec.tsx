import { renderWithProviders, screen, within } from "__support__/ui";

import type { EdgeGeometry } from "../../utils/edge-geometry";

import { SchemaViewerEdgeLayer } from "./SchemaViewerEdgeLayer";

const FIRST: EdgeGeometry = {
  id: "edge-1",
  path: "M0 0L100 0",
  symbolPath: "M4 -6L4 6",
  points: [],
};
const SECOND: EdgeGeometry = {
  id: "edge-2",
  path: "M0 50L100 50",
  symbolPath: "M4 44L4 56",
  points: [],
};

function setup(selectedEdgeIds: ReadonlySet<string>) {
  renderWithProviders(
    <SchemaViewerEdgeLayer
      geometries={[FIRST, SECOND]}
      selectedEdgeIds={selectedEdgeIds}
    />,
  );
  return screen.getByTestId("schema-viewer-edges");
}

describe("SchemaViewerEdgeLayer", () => {
  it("draws every edge and none as selected when nothing is selected", () => {
    const layer = setup(new Set());

    expect(layer).toHaveAttribute("data-edge-count", "2");
    expect(
      screen.queryByTestId("schema-viewer-selected-edge"),
    ).not.toBeInTheDocument();
  });

  it("draws selected edges separately so they render highlighted on top", () => {
    setup(new Set(["edge-2"]));

    const selected = screen.getByTestId("schema-viewer-selected-edge");
    expect(selected).toHaveAttribute("data-edge-id", "edge-2");
    expect(
      within(selected).getByTestId("schema-viewer-selected-edge-path"),
    ).toHaveAttribute("d", "M0 50L100 50");
  });
});
