import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockTransformDependencyNode,
  createMockTransformDependencyNodeData,
} from "metabase-types/api/mocks";

import { SidebarHeader } from "./SidebarHeader";

type SetupOpts = {
  node?: DependencyNode;
};

function setup({ node = createMockCardDependencyNode() }: SetupOpts = {}) {
  const onClose = jest.fn();
  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SidebarHeader node={node} onClose={onClose} mode="unreferenced" />
      )}
    />,
    { withRouter: true, initialRoute: "/" },
  );
  return { onClose };
}

describe("SidebarHeader", () => {
  it("should display the node name", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ name: "My Question" }),
      }),
    });
    expect(screen.getByText("My Question")).toBeInTheDocument();
  });

  it("should display a close button", () => {
    setup();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("should display a dependency graph link", () => {
    setup();
    expect(
      screen.getByRole("link", { name: "View in dependency graph" }),
    ).toBeInTheDocument();
  });

  it("should display an external link for nodes with links", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({ type: "question" }),
      }),
    });
    expect(
      screen.getByRole("link", { name: "View this question" }),
    ).toBeInTheDocument();
  });

  it("should display the transform name", () => {
    setup({
      node: createMockTransformDependencyNode({
        data: createMockTransformDependencyNodeData({ name: "My Transform" }),
      }),
    });
    expect(screen.getByText("My Transform")).toBeInTheDocument();
  });
});
