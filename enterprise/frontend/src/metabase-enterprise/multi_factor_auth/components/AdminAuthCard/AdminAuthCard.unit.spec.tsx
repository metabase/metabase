import userEvent from "@testing-library/user-event";

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
} from "metabase-types/api/mocks";

import { AdminAuthCard } from "./AdminAuthCard";

type SetupOpts = {
  mfaEnabled?: boolean;
  hasFeature?: boolean;
  overview?: MfaAdminOverview;
};

function setup({
  mfaEnabled = true,
  hasFeature = true,
  overview = createMockMfaAdminOverview(),
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
    storeInitialState: createMockState({
      settings: mockSettings(settings),
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

    expect(
      await screen.findByText(
        "1 user enrolled, 3 without two-factor authentication.",
      ),
    ).toBeInTheDocument();
  });

  it("should warn when the encryption key is not set", async () => {
    setup({
      overview: createMockMfaAdminOverview({ encryption_key_set: false }),
    });

    expect(
      await screen.findByText(/MB_ENCRYPTION_SECRET_KEY/),
    ).toBeInTheDocument();
  });

  it("should list the users without 2FA behind a toggle, noting overflow", async () => {
    setup({
      overview: createMockMfaAdminOverview({
        enrolled_count: 1,
        unenrolled_count: 3,
        unenrolled_users: [
          { id: 1, email: "a@example.com" },
          { id: 2, email: "b@example.com" },
        ],
        limit: 2,
        offset: 0,
      }),
    });

    await userEvent.click(
      await screen.findByText("Show users without two-factor authentication"),
    );

    expect(screen.getByText("a@example.com")).toBeInTheDocument();
    expect(screen.getByText("b@example.com")).toBeInTheDocument();
    expect(screen.getByText("…and 1 more")).toBeInTheDocument();
  });
});
