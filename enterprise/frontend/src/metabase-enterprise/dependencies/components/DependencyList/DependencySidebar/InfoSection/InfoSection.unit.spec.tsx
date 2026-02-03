import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockLastEditInfo,
  createMockSandboxDependencyNode,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransform,
  createMockTransformDependencyNode,
  createMockTransformDependencyNodeData,
  createMockUserInfo,
} from "metabase-types/api/mocks";

import { InfoSection } from "./InfoSection";

type SetupOpts = {
  node?: DependencyNode;
};

function setup({ node = createMockCardDependencyNode() }: SetupOpts = {}) {
  renderWithProviders(
    <Route path="/" component={() => <InfoSection node={node} />} />,
    { withRouter: true, initialRoute: "/" },
  );
}

describe("InfoSection", () => {
  it("should display the Info region", () => {
    setup({
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          description: "Some description",
        }),
      }),
    });
    expect(screen.getByRole("region", { name: "Info" })).toBeInTheDocument();
  });

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
          description: null,
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
    expect(screen.getByText("No owner")).toBeInTheDocument();
  });

  it("should display the transform link for tables with a transform", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          transform: createMockTransform({ id: 1, name: "My Transform" }),
        }),
      }),
    });
    expect(screen.getByText("My Transform")).toBeInTheDocument();
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
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Created by")).toBeInTheDocument();
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
    expect(screen.getByText("Carol White")).toBeInTheDocument();
    expect(screen.getByText("Last edited by")).toBeInTheDocument();
  });

  it("should not render for nodes without any info", () => {
    setup({
      node: createMockSandboxDependencyNode(),
    });
    expect(
      screen.queryByRole("region", { name: "Info" }),
    ).not.toBeInTheDocument();
  });

  it("should display owner label for transforms", () => {
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
    expect(screen.getByText("Dan Lee")).toBeInTheDocument();
  });
});
