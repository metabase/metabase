import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route as ReactRouterRoute,
  Routes as ReactRouterRoutes,
} from "react-router";

import { renderWithRouter } from "__support__/router";
import { Route, useParams } from "metabase/router";

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
    renderWithRouter(
      <Route
        path="reference/segments/:segmentId/fields/:fieldId"
        element={<ParamsProbe />}
      />,
      {
        initialRoute: "/reference/segments/42/fields/7",
      },
    );

    expect(screen.getByTestId("segment")).toHaveTextContent("42");
    expect(screen.getByTestId("field")).toHaveTextContent("7");
  });

  it("exposes the splat under v7's `*` key, not v3's `splat`", () => {
    renderWithRouter(<Route path="files/*" element={<SplatProbe />} />, {
      initialRoute: "/files/a/b",
    });

    expect(screen.getByTestId("splat")).toHaveTextContent("a/b");
    expect(screen.getByTestId("has-splat-key")).toHaveTextContent("false");
  });

  it("works outside the facade route tree, reading the host's own match", () => {
    render(
      <MemoryRouter initialEntries={["/files/a/b"]}>
        <ReactRouterRoutes>
          <ReactRouterRoute path="files/*" element={<SplatProbe />} />
        </ReactRouterRoutes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("splat")).toHaveTextContent("a/b");
  });
});
