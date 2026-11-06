import fetchMock from "fetch-mock";
import type { ReactNode } from "react";

import {
  setupHealthChecksEndpoint,
  setupNotificationChannelsEndpoints,
  setupSecurityAdvisoriesEndpoint,
  setupSecurityAdvisoriesErrorEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Advisory, HealthCheck } from "metabase-types/api";
import {
  createAdvisory,
  createMockHealthCheck,
} from "metabase-types/api/mocks/security-center";

import { AdvisoriesPage } from "../../advisories/AdvisoriesPage/AdvisoriesPage";

import { SecurityCenterLayout } from "./SecurityCenterLayout";

interface SetupOpts {
  advisories?: Advisory[];
  checks?: HealthCheck[];
  advisoriesPage?: ReactNode;
  hasAdvisoriesError?: boolean;
}

const setup = async ({
  advisories = [],
  checks = [],
  advisoriesPage = <div>Advisories page</div>,
  hasAdvisoriesError = false,
}: SetupOpts = {}) => {
  if (hasAdvisoriesError) {
    setupSecurityAdvisoriesErrorEndpoint();
  } else {
    setupSecurityAdvisoriesEndpoint(advisories);
  }
  setupHealthChecksEndpoint(checks);

  renderWithProviders(
    <Route path="/admin/security-center" element={<SecurityCenterLayout />}>
      <Route path="advisories" element={advisoriesPage} />
      <Route path="health-checks" element={<div>Health checks page</div>} />
    </Route>,
    { withRouter: true, initialRoute: "/admin/security-center/advisories" },
  );
  await act(() => fetchMock.callHistory.flush(true));
};

const getNavLink = (name: RegExp) => screen.getByRole("link", { name });

describe("SecurityCenterLayout", () => {
  it("shows the sections in the sidebar", async () => {
    await setup();

    expect(getNavLink(/Advisories/)).toHaveAttribute(
      "href",
      "/admin/security-center/advisories",
    );
    expect(getNavLink(/Health checks/)).toHaveAttribute(
      "href",
      "/admin/security-center/health-checks",
    );
  });

  it("marks the sections that have issues", async () => {
    await setup({
      advisories: [createAdvisory({ match_status: "active" })],
      checks: [createMockHealthCheck({ status: "fail" })],
    });

    expect(
      within(getNavLink(/Advisories/)).getByTestId("issue-dot"),
    ).toBeInTheDocument();
    expect(
      within(getNavLink(/Health checks/)).getByTestId("issue-dot"),
    ).toBeInTheDocument();
  });

  it("marks only the section that has issues", async () => {
    await setup({
      advisories: [createAdvisory({ match_status: "not_affected" })],
      checks: [createMockHealthCheck({ status: "fail" })],
    });

    expect(
      within(getNavLink(/Health checks/)).getByTestId("issue-dot"),
    ).toBeInTheDocument();
    expect(
      within(getNavLink(/Advisories/)).queryByTestId("issue-dot"),
    ).not.toBeInTheDocument();
  });

  it("renders a page error inside the layout (GDGT-2748)", async () => {
    setupUserRecipientsEndpoint({ users: [] });
    setupNotificationChannelsEndpoints({});
    await setup({
      advisoriesPage: <AdvisoriesPage />,
      hasAdvisoriesError: true,
    });

    expect(
      within(screen.getByTestId("admin-layout-content")).getByText(
        "Something went wrong loading security advisories.",
      ),
    ).toBeInTheDocument();
    expect(getNavLink(/Advisories/)).toBeInTheDocument();
  });
});
