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
import { Route, redirect } from "metabase/router";
import type { Advisory, HealthCheck } from "metabase-types/api";
import {
  createAdvisory,
  createMockHealthCheck,
} from "metabase-types/api/mocks/security-center";

import { AdvisoriesPage } from "../../advisories/AdvisoriesPage/AdvisoriesPage";

import { SecurityCenterLayout } from "./SecurityCenterLayout";

interface SetupOpts {
  initialRoute?: string;
  advisories?: Advisory[];
  checks?: HealthCheck[];
  advisoriesPage?: ReactNode;
  hasAdvisoriesError?: boolean;
}

const setup = async ({
  initialRoute = "/admin/security-center/advisories",
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

  const view = renderWithProviders(
    <Route path="/admin/security-center" element={<SecurityCenterLayout />}>
      <Route index element={redirect("advisories")} />
      <Route path="advisories" element={advisoriesPage} />
      <Route path="health-checks" element={<div>Health checks page</div>} />
    </Route>,
    { withRouter: true, initialRoute },
  );
  await act(() => fetchMock.callHistory.flush(true));

  return view;
};

const getNavLink = (name: RegExp) => screen.getByRole("link", { name });

describe("SecurityCenterLayout", () => {
  it("shows the sections in the sidebar", async () => {
    await setup({ initialRoute: "/admin/security-center/health-checks" });

    expect(getNavLink(/Advisories/)).toHaveAttribute(
      "href",
      "/admin/security-center/advisories",
    );
    expect(getNavLink(/Health checks/)).toHaveAttribute(
      "href",
      "/admin/security-center/health-checks",
    );
    expect(screen.getByText("Health checks page")).toBeInTheDocument();
  });

  it("opens advisories by default and keeps the query string", async () => {
    const { router } = await setup({
      initialRoute: "/admin/security-center?open=notifications",
    });

    expect(screen.getByText("Advisories page")).toBeInTheDocument();
    expect(router?.location.search).toBe("?open=notifications");
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
