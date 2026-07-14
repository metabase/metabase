import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import type { Location, Params } from "./types";
import { withRouteProps } from "./with-route-props";

interface LegacyProps {
  params: Params;
  location: Location;
}

function LegacyComponent({ params, location }: LegacyProps) {
  return (
    <div>
      <span data-testid="segment">{params.segmentId}</span>
      <span data-testid="pathname">{location.pathname}</span>
    </div>
  );
}

const WrappedComponent = withRouteProps(LegacyComponent);

describe("router/withRouteProps", () => {
  it("feeds params and location from the facade hooks into the wrapped component", () => {
    renderWithProviders(
      <Route
        path="reference/segments/:segmentId"
        component={WrappedComponent}
      />,
      {
        withRouter: true,
        initialRoute: "/reference/segments/42",
      },
    );

    expect(screen.getByTestId("segment")).toHaveTextContent("42");
    expect(screen.getByTestId("pathname")).toHaveTextContent(
      "/reference/segments/42",
    );
  });
});
