import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockMeasure } from "metabase-types/api/mocks";

import { MeasureItem } from "./MeasureItem";

describe("MeasureItem", () => {
  it("should render measure with name, description, link, and list role", () => {
    const measure = createMockMeasure({
      name: "Total Revenue",
      definition_description: "Sum of Total",
    });

    const measureUrl =
      "/data-studio/data/database/1/schema/1:PUBLIC/table/1/measures/42";

    renderWithProviders(
      <Route
        path="/"
        component={() => <MeasureItem measure={measure} href={measureUrl} />}
      />,
      { withRouter: true },
    );

    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Sum of Total")).toBeInTheDocument();

    const item = screen.getByRole("listitem");
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("href", measureUrl);
    expect(item).toHaveAttribute("aria-label", "Total Revenue");
  });

  it("should not render definition description when empty", () => {
    const measure = createMockMeasure({
      name: "Count",
      definition_description: "",
    });

    renderWithProviders(
      <Route
        path="/"
        component={() => <MeasureItem measure={measure} href="/test" />}
      />,
      { withRouter: true },
    );

    expect(
      screen.queryByTestId("list-item-description"),
    ).not.toBeInTheDocument();
  });
});
