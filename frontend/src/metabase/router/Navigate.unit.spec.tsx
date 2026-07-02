import { Route } from "react-router";

import { renderWithProviders, waitFor } from "__support__/ui";

import { Navigate } from "./Navigate";

describe("Navigate", () => {
  it("pushes to the destination on mount", async () => {
    const Host = () => <Navigate to="/dest" />;
    const { history } = renderWithProviders(
      <Route path="*" component={Host} />,
      {
        withRouter: true,
        initialRoute: "/home",
      },
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/dest"),
    );
  });

  it("replaces the current entry and carries state when asked", async () => {
    const Host = () => <Navigate to="/dest" replace state={{ from: "home" }} />;
    const { history } = renderWithProviders(
      <Route path="*" component={Host} />,
      {
        withRouter: true,
        initialRoute: "/home",
      },
    );

    await waitFor(() => {
      const location = history?.getCurrentLocation();
      expect(location?.pathname).toBe("/dest");
      expect(location?.state).toEqual({ from: "home" });
    });
  });
});
