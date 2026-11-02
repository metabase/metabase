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

import { SecurityCenterBadge } from "./SecurityCenterBadge";

type SetupOpts = {
  advisories?: Advisory[];
  checks?: HealthCheck[];
};

const setup = ({ advisories = [], checks = [] }: SetupOpts = {}) => {
  setupSecurityAdvisoriesEndpoint(advisories);
  setupHealthChecksEndpoint(checks);
  renderWithProviders(<SecurityCenterBadge />);
};

describe("SecurityCenterBadge", () => {
  it("shows when an advisory affects the instance", async () => {
    setup({ advisories: [createAdvisory({ match_status: "active" })] });

    expect(
      await screen.findByTestId("security-center-badge"),
    ).toBeInTheDocument();
  });

  it("shows when a health check fails", async () => {
    setup({ checks: [createMockHealthCheck({ status: "fail" })] });

    expect(
      await screen.findByTestId("security-center-badge"),
    ).toBeInTheDocument();
  });

  it("is hidden when nothing affects the instance and no check fails", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "not_affected" })],
      checks: [
        createMockHealthCheck({ id: "https-redirect", status: "pass" }),
        createMockHealthCheck({ id: "sso-login", status: "unknown" }),
      ],
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId("security-center-badge"),
      ).not.toBeInTheDocument();
    });
  });
});
