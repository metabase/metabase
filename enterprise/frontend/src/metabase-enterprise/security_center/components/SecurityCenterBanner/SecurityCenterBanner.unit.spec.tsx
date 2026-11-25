import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { Route } from "metabase/router";
import type { Advisory } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import { SecurityCenterBanner } from "./SecurityCenterBanner";

interface SetupOpts {
  advisories?: Advisory[];
  initialRoute?: string;
}

function setup({ advisories = [], initialRoute = "/" }: SetupOpts = {}) {
  const tokenFeatures = createMockTokenFeatures({
    advanced_permissions: true,
    hosting: false,
  });

  fetchMock.get("path:/api/ee/security-center/advisories", {
    last_checked_at: null,
    last_sync_attempted_at: null,
    last_sync_error: null,
    advisories,
  });

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": tokenFeatures,
    }),
  });

  renderWithProviders(<Route path="*" element={<SecurityCenterBanner />} />, {
    initialRoute,
    storeInitialState: state,
    withRouter: true,
  });
}

describe("SecurityCenterBanner", () => {
  it("does not render when there is no active advisory", async () => {
    setup();

    await waitForRequestsToSettle();
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  it("renders if there are active advisories", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    expect(
      await screen.findByText(/A security update is available/),
    ).toBeInTheDocument();
  });

  it("is not dismissible", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    await waitForRequestsToSettle();
    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("includes a link to security center notification settings", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
    });

    const link = await screen.findByText("Security Center");
    expect(link).toHaveAttribute("href", "/admin/security-center/advisories");
  });

  it("does not render once acknowledged", async () => {
    setup({
      advisories: [
        createAdvisory({
          match_status: "active",
          acknowledged_at: "2026-03-01T00:00:00Z",
        }),
      ],
    });

    await waitForRequestsToSettle();
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });

  it("does not render if already in Security Center", async () => {
    setup({
      advisories: [createAdvisory({ match_status: "active" })],
      initialRoute: "/admin/security-center/advisories",
    });

    await waitForRequestsToSettle();
    expect(screen.queryByTestId("app-banner")).not.toBeInTheDocument();
  });
});
