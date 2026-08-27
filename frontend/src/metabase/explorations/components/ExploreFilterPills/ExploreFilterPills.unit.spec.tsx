import { renderWithProviders, screen } from "__support__/ui";

import {
  type ExploreFilterPill,
  ExploreFilterPills,
  parseExploreFilterPills,
} from "./ExploreFilterPills";

const stateFilter: ExploreFilterPill = {
  display_value: "TX",
  dimension_name: "State",
};

describe("ExploreFilterPills", () => {
  it("labels a filter with dimension name and display value", () => {
    renderWithProviders(<ExploreFilterPills filters={[stateFilter]} />);

    expect(screen.getByTestId("filter-pill")).toHaveTextContent("State: TX");
  });

  it("falls back to display_value when dimension_name is missing", () => {
    renderWithProviders(
      <ExploreFilterPills filters={[{ display_value: "TX" }]} />,
    );

    expect(screen.getByTestId("filter-pill")).toHaveTextContent("TX");
  });

  it("renders nothing for an empty list", () => {
    renderWithProviders(<ExploreFilterPills filters={[]} />);

    expect(screen.queryByTestId("filter-pill")).not.toBeInTheDocument();
  });
});

describe("parseExploreFilterPills", () => {
  it("returns pills that have a string display_value", () => {
    expect(parseExploreFilterPills([stateFilter])).toEqual([stateFilter]);
  });

  it("returns an empty list for missing or malformed values", () => {
    expect(parseExploreFilterPills(undefined)).toEqual([]);
    expect(parseExploreFilterPills([{ display_value: 1 }])).toEqual([]);
    expect(
      parseExploreFilterPills([{ display_value: "TX", dimension_name: 1 }]),
    ).toEqual([]);
  });
});
