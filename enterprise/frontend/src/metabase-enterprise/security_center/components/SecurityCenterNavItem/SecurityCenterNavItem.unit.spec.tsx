import {
  setupHealthChecksEndpoint,
  setupSecurityAdvisoriesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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

const setup = ({ advisories = [], checks = [] }: SetupOpts = {}) => {
  setupSecurityAdvisoriesEndpoint(advisories);
  setupHealthChecksEndpoint(checks);
  renderWithProviders(<SecurityCenterNavItem currentPath="/admin" />);
};

const getNavLink = () => screen.getByRole("link", { name: /Security/ });

describe("SecurityCenterNavItem", () => {
  it("leads to the security center when nothing is wrong", async () => {
    setup();

    await waitFor(() => {
      expect(getNavLink()).toHaveAttribute("href", "/admin/security-center");
    });
  });

  it("leads to health checks when only a health check fails", async () => {
    setup({ checks: [createMockHealthCheck({ status: "fail" })] });

    await waitFor(() => {
      expect(getNavLink()).toHaveAttribute(
        "href",
        "/admin/security-center/health-checks",
      );
    });
  });

  it("leads to the security center when an advisory affects the instance", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
      checks: [createMockHealthCheck({ status: "fail" })],
    });

    await waitFor(() => {
      expect(screen.getByTestId("security-center-badge")).toBeInTheDocument();
    });
    expect(getNavLink()).toHaveAttribute("href", "/admin/security-center");
  });
});
