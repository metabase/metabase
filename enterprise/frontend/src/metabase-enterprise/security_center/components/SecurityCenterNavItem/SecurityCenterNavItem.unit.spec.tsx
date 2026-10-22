import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { Route } from "metabase/router";
import type { Advisory } from "metabase-types/api";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import { SecurityCenterNavItem } from "./SecurityCenterNavItem";

interface SetupOpts {
  advisories?: Advisory[];
  currentPath?: string;
}

function setup({ advisories = [], currentPath = "/admin" }: SetupOpts = {}) {
  fetchMock.get("path:/api/ee/security-center", {
    last_checked_at: null,
    advisories,
  });

  renderWithProviders(
    <Route
      path="*"
      element={<SecurityCenterNavItem currentPath={currentPath} />}
    />,
    { withRouter: true, initialRoute: currentPath },
  );
}

describe("SecurityCenterNavItem", () => {
  it("links to the security center", async () => {
    setup();

    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/admin/security-center",
    );
  });

  it("shows the badge when an advisory affects the instance", async () => {
    setup({ advisories: [createAdvisory({ match_status: "active" })] });

    expect(
      await screen.findByTestId("security-center-badge"),
    ).toBeInTheDocument();
  });

  it("does not show the badge when no advisory affects the instance", async () => {
    setup({ advisories: [createAdvisory({ match_status: "not_affected" })] });
    await waitForRequestsToSettle();

    expect(
      screen.queryByTestId("security-center-badge"),
    ).not.toBeInTheDocument();
  });
});
