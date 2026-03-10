import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockLastEditInfo,
  createMockSandboxDependencyNode,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransformDependencyNode,
  createMockTransformDependencyNodeData,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { PanelBody } from "./PanelBody";

type SetupOpts = {
  node?: DependencyNode;
};

function setup({ node = createMockCardDependencyNode() }: SetupOpts = {}) {
  renderWithProviders(
    <Route
      path="/"
      component={() => <PanelBody node={node} getGraphUrl={getGraphUrl} />}
    />,
    { withRouter: true, initialRoute: "/" },
  );
}

function getGraphUrl(entry: DependencyEntry) {
  return Urls.dependencyGraph({ entry });
}

describe("PanelBody", () => {
  it("should display the description", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          description: "My card description",
        }),
      }),
    });
    expect(screen.getByText("My card description")).toBeInTheDocument();
  });

  it("should display 'No description' when description is empty", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          description: "",
        }),
      }),
    });
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("should display the owner for tables", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          owner: createMockUserInfo({
            id: 1,
            first_name: "Alice",
            last_name: "Smith",
          }),
        }),
      }),
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("should display 'No owner' when owner is not set for tables", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          owner: undefined,
        }),
      }),
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("No owner")).toBeInTheDocument();
  });

  it("should display the owner for transforms", () => {
    setup({
      node: createMockTransformDependencyNode({
        data: createMockTransformDependencyNodeData({
          owner: createMockUserInfo({
            id: 2,
            first_name: "Dan",
            last_name: "Lee",
          }),
        }),
      }),
    });
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Dan Lee")).toBeInTheDocument();
  });

  it("should not display owner section for cards", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          description: "Some description",
        }),
      }),
    });
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("should not display owner section for sandboxes", () => {
    setup({
      node: createMockSandboxDependencyNode(),
    });
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("should display creator info", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          creator: createMockUserInfo({
            first_name: "Bob",
            last_name: "Jones",
            common_name: "Bob Jones",
          }),
          created_at: "2024-01-15T10:00:00Z",
        }),
      }),
    });
    expect(
      screen.getByTestId("entity-creation-info-created"),
    ).toHaveTextContent(/Bob Jones/);
  });

  it("should display last edited info", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          "last-edit-info": createMockLastEditInfo({
            id: 2,
            first_name: "Carol",
            last_name: "White",
            timestamp: "2024-02-20T15:00:00Z",
          }),
        }),
      }),
    });
    expect(screen.getByTestId("entity-creation-info-edited")).toHaveTextContent(
      /Carol White/,
    );
  });
});
