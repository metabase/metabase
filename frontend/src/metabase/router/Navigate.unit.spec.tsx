import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { act, renderWithProviders, screen, waitFor } from "__support__/ui";

import { Navigate } from "./Navigate";
import { Route } from "./route";

// Stable references: `<Navigate>` keeps `state` raw in its effect deps (like v7),
// so a fresh object literal each render would re-navigate and loop.
const HOME_STATE = { from: "home" };
const RICH_STATE = { when: new Date(0), n: NaN };

describe("router/Navigate", () => {
  it("pushes to the destination on mount, re-asserting it on back", async () => {
    const Host = () => <Navigate to="/dest" />;
    const { history } = renderWithProviders(
      <Route path="*" element={<Host />} />,
      {
        withRouter: true,
        initialRoute: "/home",
      },
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/dest"),
    );

    // Like v7: `navigate`'s identity changes with each navigation, so a mounted
    // <Navigate> re-fires on the way back and snaps forward to its target again.
    act(() => history?.goBack());
    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/dest"),
    );
  });

  it("replaces the current entry and carries state when asked", async () => {
    const Host = () => <Navigate to="/dest" replace state={HOME_STATE} />;
    const { history } = renderWithProviders(
      <Route path="*" element={<Host />} />,
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

  it("re-navigates when the target prop changes", async () => {
    const Host = () => {
      const [to, setTo] = useState("/first");
      return (
        <>
          <Navigate to={to} />
          <button onClick={() => setTo("/second")}>change</button>
        </>
      );
    };
    const { history } = renderWithProviders(
      <Route path="*" element={<Host />} />,
      {
        withRouter: true,
        initialRoute: "/home",
      },
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/first"),
    );

    await userEvent.click(screen.getByRole("button", { name: "change" }));

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/second"),
    );
  });

  it("passes state through by reference without serializing it", async () => {
    const Host = () => <Navigate to="/dest" state={RICH_STATE} />;
    const { history } = renderWithProviders(
      <Route path="*" element={<Host />} />,
      {
        withRouter: true,
        initialRoute: "/home",
      },
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/dest"),
    );

    // Unjustified type cast. FIXME
    const state = history?.getCurrentLocation().state as typeof RICH_STATE;
    // Serializing would turn the Date into a string and NaN into null.
    expect(state.when).toBe(RICH_STATE.when);
    expect(Number.isNaN(state.n)).toBe(true);
  });
});
