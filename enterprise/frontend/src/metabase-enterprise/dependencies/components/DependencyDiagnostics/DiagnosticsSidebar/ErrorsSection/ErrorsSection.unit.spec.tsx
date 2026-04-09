import { renderWithProviders, screen } from "__support__/ui";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockAnalysisFindingError,
  createMockCardDependencyNode,
} from "metabase-types/api/mocks";

import { ErrorsSection } from "./ErrorsSection";

type SetupOpts = {
  node?: DependencyNode;
};

function setup({ node = createMockCardDependencyNode() }: SetupOpts = {}) {
  renderWithProviders(<ErrorsSection node={node} />);
}

describe("ErrorsSection", () => {
  it("should display missing columns errors", () => {
    setup({
      node: createMockCardDependencyNode({
        dependents_errors: [
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "COLUMN_A",
          }),
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "COLUMN_B",
          }),
        ],
      }),
    });
    expect(
      screen.getByRole("region", { name: "Missing columns" }),
    ).toBeInTheDocument();
    expect(screen.getByText("COLUMN_A")).toBeInTheDocument();
    expect(screen.getByText("COLUMN_B")).toBeInTheDocument();
  });

  it("should display syntax errors", () => {
    setup({
      node: createMockCardDependencyNode({
        dependents_errors: [
          createMockAnalysisFindingError({
            error_type: "syntax-error",
            error_detail: "unexpected token",
          }),
        ],
      }),
    });
    expect(
      screen.getByRole("region", { name: "Syntax errors" }),
    ).toBeInTheDocument();
    expect(screen.getByText("unexpected token")).toBeInTheDocument();
  });

  it("should display duplicate column errors", () => {
    setup({
      node: createMockCardDependencyNode({
        dependents_errors: [
          createMockAnalysisFindingError({
            error_type: "duplicate-column",
            error_detail: "ID",
          }),
        ],
      }),
    });
    expect(
      screen.getByRole("region", { name: "Duplicate columns" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ID")).toBeInTheDocument();
  });

  it("should display error count badges", () => {
    setup({
      node: createMockCardDependencyNode({
        dependents_errors: [
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "COL_1",
          }),
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "COL_2",
          }),
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "COL_3",
          }),
        ],
      }),
    });
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("should group errors by type", () => {
    setup({
      node: createMockCardDependencyNode({
        dependents_errors: [
          createMockAnalysisFindingError({
            error_type: "missing-column",
            error_detail: "COL_A",
          }),
          createMockAnalysisFindingError({
            error_type: "syntax-error",
            error_detail: "bad syntax",
          }),
        ],
      }),
    });
    expect(
      screen.getByRole("region", { name: "Missing columns" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Syntax errors" }),
    ).toBeInTheDocument();
  });

  it("should not render anything when there are no errors", () => {
    setup({
      node: createMockCardDependencyNode({
        dependents_errors: [],
      }),
    });
    expect(
      screen.queryByRole("region", { name: "Missing columns" }),
    ).not.toBeInTheDocument();
  });
});
