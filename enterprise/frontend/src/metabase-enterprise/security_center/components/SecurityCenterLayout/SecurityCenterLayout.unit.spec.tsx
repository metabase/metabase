import type { ReactNode } from "react";

import {
  setupHealthChecksEndpoint,
  setupNotificationChannelsEndpoints,
  setupSecurityAdvisoriesEndpoint,
  setupSecurityAdvisoriesErrorEndpoint,
  setupUserRecipientsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

const setup = ({
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

  return renderWithProviders(
    <Route path="/admin/security-center" element={<SecurityCenterLayout />}>
      <Route index element={redirect("advisories")} />
      <Route path="advisories" element={advisoriesPage} />
      <Route path="health-checks" element={<div>Health checks page</div>} />
    </Route>,
    { withRouter: true, initialRoute },
  );
};

const getNavLink = (name: RegExp) => screen.getByRole("link", { name });

describe("SecurityCenterLayout", () => {
  it("shows the sections in the sidebar", () => {
    setup({ initialRoute: "/admin/security-center/health-checks" });

    expect(screen.getByRole("link", { name: /Advisories/ })).toHaveAttribute(
      "href",
      "/admin/security-center/advisories",
    );
    expect(screen.getByRole("link", { name: /Health checks/ })).toHaveAttribute(
      "href",
      "/admin/security-center/health-checks",
    );
    expect(screen.getByText("Health checks page")).toBeInTheDocument();
  });

  it("opens advisories by default and keeps the query string", () => {
    const { router } = setup({
      initialRoute: "/admin/security-center?open=notifications",
    });

    expect(screen.getByText("Advisories page")).toBeInTheDocument();
    expect(router?.location.search).toBe("?open=notifications");
  });

  it("marks the sections that have issues", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
      checks: [createMockHealthCheck({ status: "fail" })],
    });

    await waitFor(() => {
      expect(
        within(getNavLink(/Advisories/)).getByTestId("issue-dot"),
      ).toBeInTheDocument();
    });
    expect(
      within(getNavLink(/Health checks/)).getByTestId("issue-dot"),
    ).toBeInTheDocument();
  });

  it("marks only the section that has issues", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "not_affected" })],
      checks: [createMockHealthCheck({ status: "fail" })],
    });

    await waitFor(() => {
      expect(
        within(getNavLink(/Health checks/)).getByTestId("issue-dot"),
      ).toBeInTheDocument();
    });
    expect(
      within(getNavLink(/Advisories/)).queryByTestId("issue-dot"),
    ).not.toBeInTheDocument();
  });

  it("renders a page error inside the layout (GDGT-2748)", async () => {
    setupUserRecipientsEndpoint({ users: [] });
    setupNotificationChannelsEndpoints({});
    setup({ advisoriesPage: <AdvisoriesPage />, hasAdvisoriesError: true });

    await waitFor(() => {
      expect(
        within(screen.getByTestId("admin-layout-content")).getByText(
          "Something went wrong loading security advisories.",
        ),
      ).toBeInTheDocument();
    });
    expect(getNavLink(/Advisories/)).toBeInTheDocument();
  });
});
