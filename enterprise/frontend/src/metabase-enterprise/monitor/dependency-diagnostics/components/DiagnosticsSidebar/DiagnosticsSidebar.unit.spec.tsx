import { Route } from "react-router";

import { setupListBrokenGraphNodesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockAnalysisFindingError,
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
} from "metabase-types/api/mocks";

import type { DependencyDiagnosticsMode } from "../types";

import { DiagnosticsSidebar } from "./DiagnosticsSidebar";

type SetupOpts = {
  node?: DependencyNode;
  mode?: DependencyDiagnosticsMode;
};

function setup({
  node = createMockCardDependencyNode(),
  mode = "broken",
}: SetupOpts = {}) {
  const onResizeStart = jest.fn();
  const onResizeStop = jest.fn();
  const onClose = jest.fn();

  setupListBrokenGraphNodesEndpoint([]);
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <DiagnosticsSidebar
          node={node}
          mode={mode}
          containerWidth={1000}
          onResizeStart={onResizeStart}
          onResizeStop={onResizeStop}
          onClose={onClose}
        />
      )}
    />,
    { withRouter: true, initialRoute: "/" },
  );

  return { onResizeStart, onResizeStop, onClose };
}

describe("DiagnosticsSidebar", () => {
  it("should render the sidebar container", () => {
    setup();
    expect(screen.getByTestId("dependency-list-sidebar")).toBeInTheDocument();
  });

  it("should render the sidebar header with node name", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ name: "Test Card" }),
      }),
    });
    expect(screen.getByText("Test Card")).toBeInTheDocument();
  });

  it("should render the location section when available", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          dashboard: { id: 1, name: "My Dashboard" },
        }),
      }),
    });
    expect(
      screen.getByRole("region", { name: "Location" }),
    ).toBeInTheDocument();
  });

  it("should render the info section when available", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          description: "A description",
        }),
      }),
    });
    expect(screen.getByRole("region", { name: "Info" })).toBeInTheDocument();
  });

  it("should render errors section in broken mode", () => {
    setup({
      mode: "broken",
      node: createMockCardDependencyNode({
        dependents_errors: [
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "MISSING_COL",
          }),
        ],
      }),
    });
    expect(screen.getByText("MISSING_COL")).toBeInTheDocument();
  });

  it("should render fields section in unreferenced mode", () => {
    setup({
      mode: "unreferenced",
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          fields: [],
        }),
      }),
    });
    expect(screen.getByRole("region", { name: "Fields" })).toBeInTheDocument();
  });

  it("should not render fields section in broken mode", () => {
    setup({
      mode: "broken",
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          fields: [],
        }),
      }),
    });
    expect(
      screen.queryByRole("region", { name: "Fields" }),
    ).not.toBeInTheDocument();
  });
});
