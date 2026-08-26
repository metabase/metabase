import {
  setupMfaAdminOverviewEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { MfaAdminOverview } from "metabase-types/api";
import {
  createMockMfaAdminOverview,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { AdminAuthCard } from "./AdminAuthCard";

type SetupOpts = {
  mfaEnabled?: boolean;
  hasFeature?: boolean;
  overview?: MfaAdminOverview;
  isAdmin?: boolean;
};

function setup({
  mfaEnabled = true,
  hasFeature = true,
  overview = createMockMfaAdminOverview(),
  isAdmin = false,
}: SetupOpts = {}) {
  const enforcement = mfaEnabled ? ("optional" as const) : ("off" as const);
  const settings = createMockSettings({
    "mfa-enforcement": enforcement,
    "token-features": createMockTokenFeatures({
      "multi-factor-auth": hasFeature,
    }),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([
    createMockSettingDefinition({ key: "mfa-enforcement", value: enforcement }),
  ]);
  setupMfaAdminOverviewEndpoint(overview);

  renderWithProviders(<AdminAuthCard />, {
    withRouter: true,
    storeInitialState: createMockState({
      settings: mockSettings(settings),
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

describe("AdminAuthCard", () => {
  it("should show the enrollment counts when the setting is enabled", async () => {
    setup({
      overview: createMockMfaAdminOverview({
        enrolled_count: 1,
        unenrolled_count: 3,
      }),
    });

    expect(await screen.findByText("1 enrolled user")).toBeInTheDocument();
    expect(screen.getByText("3 users without 2FA")).toBeInTheDocument();
  });

  it("should link the counts to the drill-in lists for admins", async () => {
    setup({
      isAdmin: true,
      overview: createMockMfaAdminOverview({
        enrolled_count: 1,
        unenrolled_count: 3,
      }),
    });

    expect(
      await screen.findByRole("link", { name: "1 enrolled user" }),
    ).toHaveAttribute("href", "/admin/settings/authentication/2fa/enrolled");
    expect(
      screen.getByRole("link", { name: "3 users without 2FA" }),
    ).toHaveAttribute("href", "/admin/settings/authentication/2fa/unenrolled");
  });

  it("should not link the counts for a non-admin — the lists are superuser-only", async () => {
    setup({
      isAdmin: false,
      overview: createMockMfaAdminOverview({ enrolled_count: 1 }),
    });

    expect(await screen.findByText("1 enrolled user")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("should warn when the encryption key is not set", async () => {
    setup({
      overview: createMockMfaAdminOverview({ encryption_key_set: false }),
    });

    expect(
      await screen.findByText(/MB_ENCRYPTION_SECRET_KEY/),
    ).toBeInTheDocument();
  });
});
