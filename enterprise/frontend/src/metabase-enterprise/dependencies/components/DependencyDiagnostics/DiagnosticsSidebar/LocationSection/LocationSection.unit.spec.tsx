import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockDatabase,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransformDependencyNode,
} from "metabase-types/api/mocks";

import { LocationSection } from "./LocationSection";

type SetupOpts = {
  node?: DependencyNode;
};

function setup({ node = createMockCardDependencyNode() }: SetupOpts = {}) {
  renderWithProviders(
    <Route path="/" component={() => <LocationSection node={node} />} />,
    { withRouter: true, initialRoute: "/" },
  );
}

describe("LocationSection", () => {
  it("should display the location region", () => {
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

  it("should display the dashboard name for cards in a dashboard", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          dashboard: { id: 1, name: "My Dashboard" },
        }),
      }),
    });
    expect(screen.getByText("My Dashboard")).toBeInTheDocument();
  });

  it("should display the database and schema for tables", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          db: createMockDatabase({ id: 1, name: "My Database" }),
          schema: "public",
        }),
      }),
    });
    expect(screen.getByText("My Database")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
  });

  it("should not render for nodes without location", () => {
    setup({
      node: createMockTransformDependencyNode(),
    });
    expect(
      screen.queryByRole("region", { name: "Location" }),
    ).not.toBeInTheDocument();
  });
});
