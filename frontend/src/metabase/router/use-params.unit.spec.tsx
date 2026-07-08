import { renderWithProviders, screen } from "__support__/ui";

import { Route } from "./react-router";
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

function SplatProbe() {
  const params = useParams();
  return (
    <div>
      <span data-testid="splat">{params["*"]}</span>
      <span data-testid="has-splat-key">{String("splat" in params)}</span>
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

  it("exposes the splat under v7's `*` key, not v3's `splat`", () => {
    renderWithProviders(<Route path="files/**" component={SplatProbe} />, {
      withRouter: true,
      initialRoute: "/files/a/b",
    });

    expect(screen.getByTestId("splat")).toHaveTextContent("a/b");
    expect(screen.getByTestId("has-splat-key")).toHaveTextContent("false");
  });
});
