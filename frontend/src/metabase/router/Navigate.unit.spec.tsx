import { Route } from "react-router";

import { act, renderWithProviders, waitFor } from "__support__/ui";

import { Navigate } from "./Navigate";

describe("Navigate", () => {
  it("pushes to the destination on mount, keeping the previous entry", async () => {
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

    // v7's <Navigate> pushes by default, so /home is still on the stack.
    act(() => history?.goBack());
    expect(history?.getCurrentLocation().pathname).toBe("/home");
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

    // The replace dropped /home, so there is nothing earlier to go back to.
    act(() => history?.goBack());
    expect(history?.getCurrentLocation().pathname).toBe("/dest");
  });
});
