import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import type { Segment, Table } from "metabase-types/api";
import { createMockSegment, createMockTable } from "metabase-types/api/mocks";

import { SegmentList } from "./SegmentList";

type SetupOpts = {
  segments?: Segment[];
  table?: Partial<Table>;
};

function setup({ segments = [], table = {} }: SetupOpts = {}) {
  const mockTable = createMockTable({
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    segments,
    ...table,
  });

  renderWithProviders(
    <Route path="/" component={() => <SegmentList table={mockTable} />} />,
    { withRouter: true },
  );
}

describe("SegmentList", () => {
  it("should render empty state when no segments", () => {
    setup({ segments: [] });

    expect(screen.getByText("No segments yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create a segment to filter rows in this table."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /New segment/i }),
    ).toBeInTheDocument();
  });

  it("should render segment items", () => {
    const segments = [
      createMockSegment({
        id: 1,
        name: "High Value",
        definition_description: "Price > 100",
      }),
      createMockSegment({ id: 2, name: "Active Users" }),
    ];
    setup({ segments });

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("High Value")).toBeInTheDocument();
    expect(screen.getByText("Price > 100")).toBeInTheDocument();
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "High Value" }),
    ).toHaveAttribute(
      "href",
      "/data-studio/data/database/1/schema/1:PUBLIC/table/1/segments/1",
    );
  });
});
