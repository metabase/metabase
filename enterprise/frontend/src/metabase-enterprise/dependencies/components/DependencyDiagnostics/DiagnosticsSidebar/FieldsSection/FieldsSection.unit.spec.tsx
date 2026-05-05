import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockField,
  createMockSegmentDependencyNode,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
} from "metabase-types/api/mocks";

import { FieldsSection } from "./FieldsSection";

type SetupOpts = {
  node?: DependencyNode;
};

function setup({ node = createMockTableDependencyNode() }: SetupOpts = {}) {
  renderWithProviders(<FieldsSection node={node} />);
}

describe("FieldsSection", () => {
  it("should display the Fields region", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          fields: [createMockField({ name: "id", display_name: "ID" })],
        }),
      }),
    });
    expect(screen.getByRole("region", { name: "Fields" })).toBeInTheDocument();
  });

  it("should display field names", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          fields: [
            createMockField({ name: "id", display_name: "ID" }),
            createMockField({ name: "created_at", display_name: "Created At" }),
          ],
        }),
      }),
    });
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(screen.getByText("Created At")).toBeInTheDocument();
    expect(screen.getByText("created_at")).toBeInTheDocument();
  });

  it("should display field count badge", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          fields: [
            createMockField({ name: "id", display_name: "ID" }),
            createMockField({ name: "name", display_name: "Name" }),
            createMockField({ name: "email", display_name: "Email" }),
          ],
        }),
      }),
    });
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should not render for an entity without fields", () => {
    setup({ node: createMockSegmentDependencyNode() });
    expect(
      screen.queryByRole("region", { name: "Fields" }),
    ).not.toBeInTheDocument();
  });

  it("should display zero count when there are no fields", () => {
    setup({
      node: createMockTableDependencyNode({
        data: createMockTableDependencyNodeData({
          fields: [],
        }),
      }),
    });
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
