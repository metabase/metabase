import fetchMock from "fetch-mock";

import {
  setupHealthChecksEndpoint,
  setupSecurityAdvisoriesEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen } from "__support__/ui";
import type { Advisory, HealthCheck } from "metabase-types/api";
import {
  createAdvisory,
  createMockHealthCheck,
} from "metabase-types/api/mocks/security-center";

import { SecurityCenterNavItem } from "./SecurityCenterNavItem";

type SetupOpts = {
  advisories?: Advisory[];
  checks?: HealthCheck[];
};

const setup = async ({ advisories = [], checks = [] }: SetupOpts = {}) => {
  setupSecurityAdvisoriesEndpoint(advisories);
  setupHealthChecksEndpoint(checks);
  renderWithProviders(<SecurityCenterNavItem currentPath="/admin" />);
  await act(() => fetchMock.callHistory.flush(true));
};

const getNavLink = () => screen.getByRole("link", { name: /Security/ });

describe("SecurityCenterNavItem", () => {
  it("leads to the security center without a badge when nothing is wrong", async () => {
    await setup({
      advisories: [createAdvisory({ match_status: "not_affected" })],
      checks: [
        createMockHealthCheck({ id: "https-redirect", status: "pass" }),
        createMockHealthCheck({ id: "sso-login", status: "unknown" }),
      ],
    });

    expect(getNavLink()).toHaveAttribute("href", "/admin/security-center");
    expect(
      screen.queryByTestId("security-center-badge"),
    ).not.toBeInTheDocument();
  });

  it("leads to health checks with a badge when only a health check fails", async () => {
    await setup({ checks: [createMockHealthCheck({ status: "fail" })] });

    expect(getNavLink()).toHaveAttribute(
      "href",
      "/admin/security-center/health-checks",
    );
    expect(screen.getByTestId("security-center-badge")).toBeInTheDocument();
  });

  it("leads to the security center with a badge when an advisory affects the instance", async () => {
    await setup({ advisories: [createAdvisory({ match_status: "active" })] });

    expect(getNavLink()).toHaveAttribute("href", "/admin/security-center");
    expect(screen.getByTestId("security-center-badge")).toBeInTheDocument();
  });

  it("prefers advisories when an advisory affects the instance and a health check fails", async () => {
    await setup({
      advisories: [createAdvisory({ match_status: "active" })],
      checks: [createMockHealthCheck({ status: "fail" })],
    });

    expect(getNavLink()).toHaveAttribute("href", "/admin/security-center");
    expect(screen.getByTestId("security-center-badge")).toBeInTheDocument();
  });
});
