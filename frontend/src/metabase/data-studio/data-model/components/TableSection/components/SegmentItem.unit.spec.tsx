import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import { createMockSegment } from "metabase-types/api/mocks";

import { SegmentItem } from "./SegmentItem";

describe("SegmentItem", () => {
  it("should render segment with name, description, link, and list role", () => {
    const segment = createMockSegment({
      name: "Premium Customers",
      definition_description: "Total > $1000",
    });

    const segmentUrl = Urls.dataModelSegment(segment.id);

    renderWithProviders(
      <Route
        path="/"
        component={() => <SegmentItem segment={segment} href={segmentUrl} />}
      />,
      { withRouter: true },
    );

    expect(screen.getByText("Premium Customers")).toBeInTheDocument();
    expect(screen.getByText("Total > $1000")).toBeInTheDocument();

    const item = screen.getByRole("listitem");
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("href", segmentUrl);
    expect(item).toHaveAttribute("aria-label", "Premium Customers");
  });

  it("should not render definition description when empty", () => {
    const segment = createMockSegment({
      name: "Premium",
      definition_description: "",
    });

    renderWithProviders(
      <Route
        path="/"
        component={() => <SegmentItem segment={segment} href="/test" />}
      />,
      { withRouter: true },
    );

    expect(
      screen.queryByTestId("list-item-description"),
    ).not.toBeInTheDocument();
  });
});
