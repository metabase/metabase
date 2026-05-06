import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { UserMetabotPermissionsResponse } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { useUserMetabotPermissions } from "./use-user-metabot-permissions";

function TestComponent() {
  const perms = useUserMetabotPermissions();
  return <div data-testid="perms">{JSON.stringify(perms)}</div>;
}

function setup({
  isMetabotEnabled = true,
  apiResponse,
  apiStatus = 200,
}: {
  isMetabotEnabled?: boolean;
  apiResponse?: UserMetabotPermissionsResponse;
  apiStatus?: number;
} = {}) {
  if (apiStatus === 200) {
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      apiResponse ?? createMockUserMetabotPermissions(),
    );
  } else {
    fetchMock.get("path:/api/metabot/permissions/user-permissions", apiStatus);
  }

  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": isMetabotEnabled,
    "token-features": createMockTokenFeatures({ ai_controls: true }),
  });
  setupEnterprisePlugins();

  renderWithProviders(<TestComponent />, {
    storeInitialState: createMockState({ settings }),
  });
}

async function getPerms() {
  let perms: Record<string, unknown> = {};
  await waitFor(() => {
    const el = screen.getByTestId("perms");
    perms = JSON.parse(el.textContent || "{}");
    expect(perms.isLoading).toBe(false);
  });
  return perms;
}

describe("useUserMetabotPermissions", () => {
  it("returns all true when metabot is enabled and all permissions are yes", async () => {
    setup();
    const perms = await getPerms();
    expect(perms.canUseMetabot).toBe(true);
    expect(perms.canUseSqlGeneration).toBe(true);
    expect(perms.canUseNlq).toBe(true);
    expect(perms.canUseOtherTools).toBe(true);
    expect(perms.isError).toBe(false);
  });

  it("returns all false when metabot is globally disabled", async () => {
    setup({ isMetabotEnabled: false });
    const perms = await getPerms();
    expect(perms.canUseMetabot).toBe(false);
    expect(perms.canUseSqlGeneration).toBe(false);
    expect(perms.canUseNlq).toBe(false);
    expect(perms.canUseOtherTools).toBe(false);
  });

  it("returns all false when the API returns an error", async () => {
    setup({ apiStatus: 500 });
    await waitFor(() => {
      const el = screen.getByTestId("perms");
      const perms = JSON.parse(el.textContent || "{}");
      expect(perms.isError).toBe(true);
    });
    const el = screen.getByTestId("perms");
    const perms = JSON.parse(el.textContent || "{}");
    expect(perms.canUseMetabot).toBe(false);
    expect(perms.canUseSqlGeneration).toBe(false);
    expect(perms.canUseNlq).toBe(false);
    expect(perms.canUseOtherTools).toBe(false);
  });

  it("returns canUseMetabot=false when base permission is no", async () => {
    setup({
      apiResponse: createMockUserMetabotPermissions({ metabot: "no" }),
    });
    const perms = await getPerms();
    expect(perms.canUseMetabot).toBe(false);
    expect(perms.canUseSqlGeneration).toBe(false);
    expect(perms.canUseNlq).toBe(false);
    expect(perms.canUseOtherTools).toBe(false);
  });

  it("returns canUseSqlGeneration=false when sql-generation is no", async () => {
    setup({
      apiResponse: createMockUserMetabotPermissions({
        "metabot-sql-generation": "no",
      }),
    });
    const perms = await getPerms();
    expect(perms.canUseMetabot).toBe(true);
    expect(perms.canUseSqlGeneration).toBe(false);
    expect(perms.canUseNlq).toBe(true);
    expect(perms.canUseOtherTools).toBe(true);
  });

  it("returns canUseNlq=false when nlq is no", async () => {
    setup({
      apiResponse: createMockUserMetabotPermissions({ "metabot-nlq": "no" }),
    });
    const perms = await getPerms();
    expect(perms.canUseMetabot).toBe(true);
    expect(perms.canUseSqlGeneration).toBe(true);
    expect(perms.canUseNlq).toBe(false);
    expect(perms.canUseOtherTools).toBe(true);
  });

  it("returns canUseOtherTools=false when other-tools is no", async () => {
    setup({
      apiResponse: createMockUserMetabotPermissions({
        "metabot-other-tools": "no",
      }),
    });
    const perms = await getPerms();
    expect(perms.canUseMetabot).toBe(true);
    expect(perms.canUseSqlGeneration).toBe(true);
    expect(perms.canUseNlq).toBe(true);
    expect(perms.canUseOtherTools).toBe(false);
  });
});
