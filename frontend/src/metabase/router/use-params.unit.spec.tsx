import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { useParams } from "./use-params";

function ParamsProbe() {
  const { segmentId, fieldId } = useParams();
  return (
    <div>
      <span data-testid="segment">{segmentId}</span>
      <span data-testid="field">{fieldId}</span>
    </div>
  );
}

describe("router/useParams", () => {
  it("returns the params matched by the v3 route", () => {
    renderWithProviders(
      <Route
        path="reference/segments/:segmentId/fields/:fieldId"
        component={ParamsProbe}
      />,
      {
        withRouter: true,
        initialRoute: "/reference/segments/42/fields/7",
      },
    );

    expect(screen.getByTestId("segment")).toHaveTextContent("42");
    expect(screen.getByTestId("field")).toHaveTextContent("7");
  });
});
