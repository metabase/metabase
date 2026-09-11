import userEvent from "@testing-library/user-event";
import { useLayoutEffect } from "react";

import { act, renderWithProviders, screen } from "__support__/ui";
import { Route, useNavigate, useRouteLeaveBlocker } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

// A dirty page: still blocking even after the user confirms, exactly like an
// unsaved question whose confirmation discards nothing until navigation.
function GuardedPage() {
  const blocker = useRouteLeaveBlocker(() => true);

  return (
    <div>
      <span data-testid="page">question</span>
      <button onClick={() => blocker.proceed?.()}>proceed</button>
    </div>
  );
}

// Mirrors RedirectToAllowedSettings: the section landing page replaces to the
// first allowed section in a layout effect on mount.
function SectionIndexRedirect() {
  const navigate = useNavigate();

  useLayoutEffect(() => {
    navigate("/admin/settings", { replace: true });
  }, [navigate]);

  return null;
}

const tree = (
  <Route path="/">
    <Route path="question" element={<GuardedPage />} />
    <Route path="admin">
      <Route index element={<SectionIndexRedirect />} />
      <Route path="settings" element={<span>settings</span>} />
    </Route>
  </Route>
);

describe("route leave guards", () => {
  it("lets a mount redirect through once the confirmed page unmounts (metabase#82316)", async () => {
    const { router } = renderWithProviders(tree, {
      withRouter: true,
      initialRoute: "/question",
    });
    const testRouter = checkNotNull(router);
    expect(await screen.findByTestId("page")).toBeInTheDocument();

    act(() => {
      testRouter.navigate("/admin");
    });
    expect(testRouter.location.pathname).toBe("/question");

    await userEvent.click(screen.getByRole("button", { name: "proceed" }));

    expect(await screen.findByText("settings")).toBeInTheDocument();
    expect(testRouter.location.pathname).toBe("/admin/settings");
  });
});
