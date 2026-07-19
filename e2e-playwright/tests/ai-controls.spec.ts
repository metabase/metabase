/**
 * Playwright port of e2e/test/scenarios/metabot/ai-controls.cy.spec.ts
 *
 * Admin AI/metabot controls: feature-access, customization (name / icon /
 * illustrations), system prompts, and usage limits (instance / group / tenant),
 * plus the agent-streaming tests that exercise the backend quota machinery.
 *
 * Port notes:
 * - The LLM is stubbed via a mock Anthropic Messages server on an EPHEMERAL
 *   port (support/ai-controls.ts startMockLlmServer), pointed at by
 *   llm-anthropic-api-base-url. This is the faithful equivalent of the spec's
 *   cy.task("startMockLlmServer"): requests flow through the REAL backend, so
 *   the quota checks these tests are about actually run. mockMetabotResponse
 *   (support/metabot.ts) is deliberately NOT used for the quota tests — a
 *   browser-level stub bypasses the backend and makes every quota assertion
 *   vacuous. See the module header for the full argument.
 * - Token-gated (EE). Each describe activates "pro-self-hosted" and skips if the
 *   token env var is missing.
 * - cy.intercept(...).as() + cy.wait("@x") → page.waitForResponse registered
 *   BEFORE the triggering action, awaited after (PORTING rule 2).
 * - H.updateEnterpriseSettings({...}) → per-key api.updateSetting (equivalent:
 *   each is PUT /api/setting/:key).
 * - Admin settings text inputs are debounce-saved: typeAndBlur (click + fill +
 *   blur) marks the controlled form dirty and commits (PORTING wave-5 note).
 * - The tenant user is not one of the cached USERS, so signInViaCookie POSTs
 *   /api/session and installs the browser session cookies (the equivalent of
 *   the spec's cy.request("POST", "/api/session")).
 */
import type { Page } from "@playwright/test";

import {
  ALL_USERS_GROUP_ID,
  DEFAULT_QUOTA_MESSAGE,
  MOCK_LLM_RESPONSE,
  type MockLlmServer,
  NORMAL_USER_ID,
  TINY_PNG_BASE64,
  TINY_PNG_DATA_URI,
  configureMockLlm,
  signInViaCookie,
  startMockLlmServer,
  typeAndBlur,
  visitHomeAndWaitForXray,
} from "../support/ai-controls";
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  lastChatMessage,
  openMetabotViaSearchButton,
  sendMetabotMessage,
} from "../support/metabot";
import { appBar, main } from "../support/ui";

/** Register a wait for a PUT/GET on an /api path (matched by pathname). */
function waitForApi(
  page: Page,
  method: "GET" | "PUT" | "POST",
  pathname: string,
) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === pathname,
  );
}

test.describe("AI Controls > Metabot access and customization", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  let mockLlm: MockLlmServer;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("metabot-enabled?", true);
    mockLlm = await startMockLlmServer();
    await configureMockLlm(mb.api, mockLlm.url);
  });

  test.afterEach(async () => {
    await mockLlm.stop();
  });

  test.describe("Feature Access page", () => {
    test("should display the AI feature access table with groups and save a permission change", async ({
      page,
    }) => {
      const getPermissions = waitForApi(
        page,
        "GET",
        "/api/ee/ai-controls/permissions",
      );
      await page.goto("/admin/metabot/usage-controls/ai-feature-access");
      await getPermissions;

      const table = page.getByTestId("ai-feature-access-table");
      await expect(table).toBeVisible();

      // Column headers
      await expect(table.getByText("AI features", { exact: true })).toBeVisible();
      await expect(
        table.getByText("Chat and NLQ", { exact: true }),
      ).toBeVisible();
      await expect(
        table.getByText("SQL generation", { exact: true }),
      ).toBeVisible();
      await expect(table.getByText("Other tools", { exact: true })).toBeVisible();

      // Admins row: switch always checked and disabled
      const adminRow = page.getByRole("row", {
        name: /Administrators permissions/,
      });
      await expect(adminRow.getByRole("switch")).toBeChecked();
      await expect(adminRow.getByRole("switch")).toBeDisabled();

      const allUsersRow = page.getByRole("row", {
        name: /All Users permissions/,
      });
      const allUsersSwitch = allUsersRow.getByRole("switch");

      // Toggle the metabot AI features switch off (default is checked)
      await expect(allUsersSwitch).toBeChecked();
      let updatePermissions = waitForApi(
        page,
        "PUT",
        "/api/ee/ai-controls/permissions",
      );
      await allUsersSwitch.click({ force: true });
      expect((await updatePermissions).status()).toBe(200);

      // Switch off and all checkboxes unchecked
      await expect(allUsersSwitch).not.toBeChecked();
      const uncheckedBoxes = allUsersRow.getByRole("checkbox");
      const uncheckedCount = await uncheckedBoxes.count();
      for (let i = 0; i < uncheckedCount; i++) {
        await expect(uncheckedBoxes.nth(i)).not.toBeChecked();
      }

      // Toggle the metabot AI features switch on again
      updatePermissions = waitForApi(
        page,
        "PUT",
        "/api/ee/ai-controls/permissions",
      );
      await allUsersSwitch.click({ force: true });
      expect((await updatePermissions).status()).toBe(200);

      // When metabot permission is on, all tools are enabled by default
      const checkedBoxes = allUsersRow.getByRole("checkbox");
      const checkedCount = await checkedBoxes.count();
      for (let i = 0; i < checkedCount; i++) {
        await expect(checkedBoxes.nth(i)).toBeChecked();
      }
    });
  });

  test.describe("Group access controls", () => {
    test("should not show the Metabot chat icon for users in a group without Metabot access", async ({
      page,
      mb,
    }) => {
      // Get current permissions, then set only the All Users group to "no"
      const current = (await (
        await mb.api.get("/api/ee/ai-controls/permissions")
      ).json()) as {
        permissions: Array<{
          group_id: number;
          perm_type: string;
          perm_value: string;
        }>;
      };
      const updatedPermissions = current.permissions.map((p) =>
        p.group_id === ALL_USERS_GROUP_ID && p.perm_type === "permission/metabot"
          ? { ...p, perm_value: "no" }
          : p,
      );
      await mb.api.put("/api/ee/ai-controls/permissions", {
        permissions: updatedPermissions,
      });

      // Sign in as a normal user (only in the All Users group)
      await mb.signInAsNormalUser();
      await page.goto("/");

      await expect(page.getByLabel("Navigation bar")).toBeVisible();

      // The Metabot chat icon should not be present
      await expect(
        appBar(page).locator('[aria-label*="Chat with"]'),
      ).toHaveCount(0);
    });
  });

  test.describe("Customization", () => {
    test("should save a custom Metabot name", async ({ page }) => {
      await page.goto("/admin/metabot/customization");

      await expect(
        page.getByRole("heading", { name: "Customization", level: 1 }),
      ).toBeVisible();

      const nameField = page.getByLabel("AI agent's name", { exact: true });
      await expect(nameField).toBeVisible();

      const saveName = waitForApi(page, "PUT", "/api/setting/metabot-name");
      await typeAndBlur(page, "AI agent's name", "HAL 9000");
      expect((await saveName).status()).toBe(204);

      // Reload and verify persistence
      await page.reload();
      await expect(
        page.getByLabel("AI agent's name", { exact: true }),
      ).toHaveValue("HAL 9000");
    });

    test("should upload a custom Metabot icon and show the illustrations section", async ({
      page,
    }) => {
      await page.goto("/admin/metabot/customization");

      await expect(
        main(page).getByText("AI agent's icon", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Upload a custom icon" }),
      ).toBeVisible();

      // The illustrations section is hidden until a custom icon is set
      await expect(
        main(page).getByText("Metabot illustrations", { exact: true }),
      ).toHaveCount(0);

      // Upload a tiny PNG via the hidden file input
      const saveIcon = waitForApi(page, "PUT", "/api/setting/metabot-icon");
      await page.locator('input[type="file"]').setInputFiles({
        name: "metabot-icon.png",
        mimeType: "image/png",
        buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
      });
      expect((await saveIcon).status()).toBe(204);

      // The illustrations section should now appear
      await expect(
        main(page).getByText("Metabot illustrations", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("switch", { name: /Show Metabot illustrations/ })
          .locator("xpath=.."),
      ).toBeVisible();

      // The "Remove custom icon" button should be visible
      await expect(page.getByLabel("Remove custom icon")).toBeVisible();
    });

    test("should hide Metabot illustrations when the toggle is switched off", async ({
      page,
      mb,
    }) => {
      // Set a custom icon via API so the illustrations toggle is visible
      await mb.api.updateSetting("metabot-icon", TINY_PNG_DATA_URI);
      await mb.api.updateSetting("metabot-show-illustrations", true);
      await mb.api.updateSetting("metabot-enabled?", true);

      await page.goto("/admin/metabot/customization");

      await expect(
        main(page).getByText("Metabot illustrations", { exact: true }),
      ).toBeVisible();

      const illustrationsSwitch = page.getByRole("switch", {
        name: "Show Metabot illustrations",
        exact: true,
      });
      // The switch should be ON
      await expect(illustrationsSwitch).toHaveAttribute("data-checked", "true");
      // The switch stays `disabled` until the admin-settings-details query
      // resolves (isLoading = settingsLoading || detailsLoading), and a click on
      // a disabled input silently no-ops — wait for it to be enabled first.
      await expect(illustrationsSwitch).toBeEnabled();

      // Toggle illustrations off
      const saveIllustrations = waitForApi(
        page,
        "PUT",
        "/api/setting/metabot-show-illustrations",
      );
      await illustrationsSwitch.click({ force: true });
      expect((await saveIllustrations).status()).toBe(204);

      // Open Metabot chat and verify illustrations are hidden
      await page.goto("/");
      // Can't use the .Icon-metabot search button because the custom icon
      // replaces it — use the app bar button by accessible name.
      await appBar(page)
        .getByRole("button", { name: /Chat with/ })
        .click();

      const emptyInfo = page.getByTestId("metabot-empty-chat-info");
      await expect(emptyInfo).toBeVisible();
      // The SVG illustration should NOT be rendered when showIllustrations=false
      await expect(emptyInfo.locator("svg")).toHaveCount(0);
      // The hint text should still be visible, with the no-illustration copy
      await expect(
        emptyInfo.getByText(/Explore your metrics and models with AI/),
      ).toBeVisible();
    });

    test("should show the custom Metabot name in the app bar button tooltip", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("metabot-name", "Aria");

      await page.goto("/");
      await expect(page.getByLabel("Navigation bar")).toBeVisible();

      // The app bar button tooltip/aria-label should reflect the custom name
      await expect(
        appBar(page).getByRole("button", { name: /Chat with Aria/ }),
      ).toBeVisible();
    });

    test("should show a custom Metabot icon in the app bar when metabot-icon is set", async ({
      page,
      mb,
    }) => {
      await mb.api.updateSetting("metabot-icon", TINY_PNG_DATA_URI);

      await page.goto("/");
      await expect(page.getByLabel("Navigation bar")).toBeVisible();

      // When a custom icon is set, MetabotIcon renders an <img> with alt = name
      await expect(
        appBar(page)
          .getByRole("button", { name: /Chat with/ })
          .locator("img"),
      ).toBeVisible();
    });
  });

  test.describe("System Prompts pages", () => {
    test("should save a custom Metabot chat system prompt", async ({ page }) => {
      await page.goto("/admin/metabot/system-prompts/metabot-chat");

      await expect(
        page.getByRole("heading", {
          name: "AI chat prompt instructions",
          level: 1,
        }),
      ).toBeVisible();

      const promptBox = page.getByRole("textbox", {
        name: /AI chat prompt instructions/,
      });
      await expect(promptBox).toBeVisible();

      const savePrompt = waitForApi(
        page,
        "PUT",
        "/api/setting/metabot-chat-system-prompt",
      );
      await promptBox.click();
      await promptBox.fill("Be concise and helpful.");
      await promptBox.blur();
      expect((await savePrompt).status()).toBe(204);

      // Reload and verify persistence
      await page.reload();
      await expect(
        page.getByRole("textbox", { name: /AI chat prompt instructions/ }),
      ).toHaveValue(/Be concise and helpful\./);
    });

    test("should save a custom SQL generation system prompt", async ({
      page,
    }) => {
      await page.goto("/admin/metabot/system-prompts/sql-generation");

      await expect(
        page.getByRole("heading", {
          name: "SQL generation prompt instructions",
          level: 1,
        }),
      ).toBeVisible();

      const promptBox = page.getByRole("textbox", {
        name: /SQL generation prompt instructions/,
      });
      await expect(promptBox).toBeVisible();

      const saveSqlPrompt = waitForApi(
        page,
        "PUT",
        "/api/setting/metabot-sql-system-prompt",
      );
      await promptBox.click();
      await promptBox.fill("Always use uppercase SQL keywords.");
      await promptBox.blur();
      expect((await saveSqlPrompt).status()).toBe(204);

      await page.reload();
      await expect(
        page.getByRole("textbox", { name: /SQL generation prompt instructions/ }),
      ).toHaveValue(/Always use uppercase SQL keywords\./);
    });
  });
});

test.describe("AI controls > AI usage limits", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  const AI_USAGE_LIMITS_URL = "/admin/metabot/usage-controls/ai-usage-limits";

  let mockLlm: MockLlmServer;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    mockLlm = await startMockLlmServer();
    await configureMockLlm(mb.api, mockLlm.url);
  });

  test.afterEach(async () => {
    await mockLlm.stop();
  });

  test.describe("AI Limits settings can be saved properly", () => {
    test("should save limit type, reset period, instance limit, and quota-reached message when changed", async ({
      page,
    }) => {
      const getInstanceLimit = waitForApi(
        page,
        "GET",
        "/api/ee/ai-controls/usage/instance",
      );
      await page.goto(AI_USAGE_LIMITS_URL);
      await getInstanceLimit;

      // Change limit type to messages
      const saveLimitUnit = waitForApi(
        page,
        "PUT",
        "/api/setting/metabot-limit-unit",
      );
      // The SegmentedControl radio input is visually hidden and offscreen;
      // click its visible label (auto-scrolls into view).
      await page.getByText("By message count", { exact: true }).click();
      expect(await (await saveLimitUnit).request().postDataJSON()).toEqual({
        value: "messages",
      });

      // Change reset period to weekly
      const saveLimitPeriod = waitForApi(
        page,
        "PUT",
        "/api/setting/metabot-limit-reset-rate",
      );
      await page.getByText("Weekly", { exact: true }).click();
      expect(await (await saveLimitPeriod).request().postDataJSON()).toEqual({
        value: "weekly",
      });

      // Type an instance limit value
      const updateInstanceLimit = waitForApi(
        page,
        "PUT",
        "/api/ee/ai-controls/usage/instance",
      );
      await page
        .getByLabel("Total weekly instance message limit", { exact: true })
        .fill("500");
      expect(
        await (await updateInstanceLimit).request().postDataJSON(),
      ).toEqual({ max_usage: 500 });

      // Type a quota-reached message
      const saveQuotaMessage = waitForApi(
        page,
        "PUT",
        "/api/setting/metabot-quota-reached-message",
      );
      await typeAndBlur(
        page,
        "Quota-reached message",
        "You have hit the AI usage limit.",
      );
      expect(await (await saveQuotaMessage).request().postDataJSON()).toEqual({
        value: "You have hit the AI usage limit.",
      });
    });

    test("should save instance limit as null when the field is cleared", async ({
      page,
      mb,
    }) => {
      // Pre-set a limit so there's something to clear
      await mb.api.put("/api/ee/ai-controls/usage/instance", {
        max_usage: 100,
      });

      const getInstanceLimit = waitForApi(
        page,
        "GET",
        "/api/ee/ai-controls/usage/instance",
      );
      await page.goto(AI_USAGE_LIMITS_URL);
      await getInstanceLimit;

      const updateInstanceLimit = waitForApi(
        page,
        "PUT",
        "/api/ee/ai-controls/usage/instance",
      );
      await page
        .getByRole("textbox", { name: "Total monthly instance token limit" })
        .clear();
      expect(
        await (await updateInstanceLimit).request().postDataJSON(),
      ).toEqual({ max_usage: null });
    });
  });

  test.describe("When instance limit is set to 0", () => {
    test.beforeEach(async ({ mb }) => {
      // Enable Metabot with a configured LLM key
      await mb.api.updateSetting("metabot-enabled?", true);

      // messages limit type (easier to trigger with 0)
      await mb.api.updateSetting("metabot-limit-unit", "messages");

      // Custom quota-reached message
      await mb.api.updateSetting(
        "metabot-quota-reached-message",
        DEFAULT_QUOTA_MESSAGE,
      );

      // Instance limit 0 — any usage immediately exceeds it
      await mb.api.put("/api/ee/ai-controls/usage/instance", { max_usage: 0 });
    });

    test("should show the quota-reached message when the user sends a message to Metabot", async ({
      page,
    }) => {
      await visitHomeAndWaitForXray(page);

      await openMetabotViaSearchButton(page);
      await sendMetabotMessage(page, "hello");

      // The backend returns the quota-reached message when limit is exceeded
      await expect(lastChatMessage(page)).toHaveText(DEFAULT_QUOTA_MESSAGE);
    });
  });

  test.describe("Group limits handling", () => {
    let groupAId: number;
    let groupBId: number;

    test.beforeEach(async ({ mb }) => {
      await mb.api.updateSetting("metabot-limit-unit", "messages");
      await mb.api.updateSetting(
        "metabot-quota-reached-message",
        DEFAULT_QUOTA_MESSAGE,
      );

      // Set instance limit high so it doesn't interfere
      await mb.api.put("/api/ee/ai-controls/usage/instance", {
        max_usage: 1000,
      });

      // limit-for-user returns NULL (unlimited) when any of the user's groups
      // has no metabot_group_limit row, and returns the MAX across all groups.
      // Set a low limit (1) on every pre-existing group the normal user belongs
      // to so the effective limit equals Group B's 100.
      const memberships = (await (
        await mb.api.get("/api/permissions/membership")
      ).json()) as Record<string, Array<{ group_id: number }>>;
      const normalUserMemberships = memberships[String(NORMAL_USER_ID)];
      if (normalUserMemberships) {
        for (const m of normalUserMemberships) {
          await mb.api.put(`/api/ee/ai-controls/usage/group/${m.group_id}`, {
            max_usage: 1,
          });
        }
      }

      // Create group A (low: 5) and group B (high: 100); add normal user to both
      const groupA = await (
        await mb.api.post("/api/permissions/group", {
          name: "AI Limit Group A (low)",
        })
      ).json();
      groupAId = groupA.id;
      await mb.api.put(`/api/ee/ai-controls/usage/group/${groupAId}`, {
        max_usage: 5,
      });
      await mb.api.post("/api/permissions/membership", {
        group_id: groupAId,
        user_id: NORMAL_USER_ID,
      });

      const groupB = await (
        await mb.api.post("/api/permissions/group", {
          name: "AI Limit Group B (high)",
        })
      ).json();
      groupBId = groupB.id;
      await mb.api.put(`/api/ee/ai-controls/usage/group/${groupBId}`, {
        max_usage: 100,
      });
      await mb.api.post("/api/permissions/membership", {
        group_id: groupBId,
        user_id: NORMAL_USER_ID,
      });
    });

    test.afterEach(async ({ mb }) => {
      // Sign back in as admin for cleanup (tests may end signed in as normal user)
      await mb.signInAsAdmin();

      await mb.api.fetch("DELETE", "/api/testing/metabot/seed-ai-usage", {
        data: { user_id: NORMAL_USER_ID },
      });
      await mb.api.put("/api/ee/ai-controls/usage/instance", {
        max_usage: null,
      });
      if (groupAId) {
        await mb.api.fetch("DELETE", `/api/permissions/group/${groupAId}`);
      }
      if (groupBId) {
        await mb.api.fetch("DELETE", `/api/permissions/group/${groupBId}`);
      }
    });

    test("should display both groups with their configured limits and note that users get the highest limit", async ({
      page,
    }) => {
      await page.goto(AI_USAGE_LIMITS_URL);

      // Both groups appear in the group limits table with correct values
      await expect(
        page.getByLabel("Max messages per user for AI Limit Group A (low)", {
          exact: true,
        }),
      ).toHaveValue("5");
      await expect(
        page.getByLabel("Max messages per user for AI Limit Group B (high)", {
          exact: true,
        }),
      ).toHaveValue("100");

      // The section description should explain that users get the highest limit
      const note = page
        .getByTestId("group-limits-tab")
        .getByText(
          /If a user belongs to more than one group, they'll be given the highest limit among all the groups/i,
        );
      await note.scrollIntoViewIfNeeded();
      await expect(note).toBeVisible();
    });

    test("should respect the effective user limit (max across their groups)", async ({
      page,
      mb,
    }) => {
      // Normal user is in group A (5) and group B (100). Effective = 100.
      // Seed 10 usage rows — below the effective limit of 100
      await mb.api.post("/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
        count: 10,
      });

      await mb.signInAsNormalUser();
      await visitHomeAndWaitForXray(page);

      await openMetabotViaSearchButton(page);
      await sendMetabotMessage(page, "hello");

      // usage (10) < effective limit (100): backend passes the quota check,
      // calls the mock LLM, and streams its response
      await expect(lastChatMessage(page)).toContainText(MOCK_LLM_RESPONSE);

      // Seed 91 more rows so total (101) exceeds the effective group limit (100)
      await mb.signInAsAdmin();
      await mb.api.post("/api/testing/metabot/seed-ai-usage", {
        user_id: NORMAL_USER_ID,
        count: 91,
      });

      await mb.signInAsNormalUser();
      await visitHomeAndWaitForXray(page);

      await openMetabotViaSearchButton(page);
      await sendMetabotMessage(page, "hello");

      // usage (101) > effective group limit (100): backend short-circuits
      // before calling the LLM and returns the quota-reached message
      await expect(lastChatMessage(page)).toHaveText(DEFAULT_QUOTA_MESSAGE);
    });
  });
});

test.describe("AI Controls > Tenant usage limits", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  const TENANT_USER_EMAIL = "tenant.user@metabase-test.com";
  const TENANT_USER_PASSWORD = "12341234";

  let mockLlm: MockLlmServer;
  let tenantId: number;
  let tenantUserId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("metabot-enabled?", true);

    await mb.api.updateSetting(
      "metabot-quota-reached-message",
      DEFAULT_QUOTA_MESSAGE,
    );

    // Enable multi-tenancy
    await mb.api.updateSetting("use-tenants", true);

    // Create a tenant
    const tenant = await (
      await mb.api.post("/api/ee/tenant", {
        name: "Test Corp",
        slug: "test-corp",
      })
    ).json();
    tenantId = tenant.id;

    // Create a user belonging to that tenant
    const user = await (
      await mb.api.post("/api/user", {
        first_name: "Tenant",
        last_name: "User",
        email: TENANT_USER_EMAIL,
        password: TENANT_USER_PASSWORD,
        tenant_id: tenantId,
      })
    ).json();
    tenantUserId = user.id;

    mockLlm = await startMockLlmServer();
    await configureMockLlm(mb.api, mockLlm.url);
  });

  test.afterEach(async () => {
    await mockLlm.stop();
  });

  test("should allow updating tenant limits when tenants are enabled", async ({
    page,
  }) => {
    await page.goto("/admin/metabot/usage-controls/ai-usage-limits");

    await page.getByRole("tab", { name: "Specific tenants", exact: true }).click();

    const tenantTab = page.getByTestId("tenant-limits-tab");
    await expect(tenantTab).toBeVisible();
    await expect(tenantTab.getByText("Test Corp", { exact: true })).toBeVisible();

    const updateTenantLimit = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/ee\/ai-controls\/usage\/tenant\/[^/]+$/.test(
          new URL(response.url()).pathname,
        ),
    );
    await page
      .getByLabel("Max total monthly tokens for Test Corp", { exact: true })
      .fill("10");
    expect((await updateTenantLimit).status()).toBe(200);
  });

  test("should show the quota-reached message when the tenant limit is set to 0 and the user sends a message", async ({
    page,
    mb,
  }) => {
    // Set tenant limit to 0 — any usage immediately exceeds it
    await mb.api.put(`/api/ee/ai-controls/usage/tenant/${tenantId}`, {
      max_usage: 0,
    });
    // Clear the backend limit-check cache so the new limit is seen immediately
    await mb.api.fetch("DELETE", "/api/testing/metabot/seed-ai-usage", {
      data: { user_id: tenantUserId },
    });

    // Sign in as the tenant user
    await signInViaCookie(
      page,
      mb.api,
      mb.baseUrl,
      TENANT_USER_EMAIL,
      TENANT_USER_PASSWORD,
    );

    await visitHomeAndWaitForXray(page);

    await openMetabotViaSearchButton(page);
    await sendMetabotMessage(page, "hello");

    // The backend returns the quota-reached message when the tenant limit is exceeded
    await expect(lastChatMessage(page)).toContainText(DEFAULT_QUOTA_MESSAGE);
  });

  test("should not show the quota-reached message when no tenant limit is set", async ({
    page,
    mb,
  }) => {
    // No tenant limit — the chat input should be available without a quota message
    await mb.api.put(`/api/ee/ai-controls/usage/tenant/${tenantId}`, {
      max_usage: null,
    });
    // Clear the backend limit-check cache so the new null limit is seen immediately
    await mb.api.fetch("DELETE", "/api/testing/metabot/seed-ai-usage", {
      data: { user_id: tenantUserId },
    });

    // Sign in as the tenant user
    await signInViaCookie(
      page,
      mb.api,
      mb.baseUrl,
      TENANT_USER_EMAIL,
      TENANT_USER_PASSWORD,
    );

    await visitHomeAndWaitForXray(page);

    await openMetabotViaSearchButton(page);
    await sendMetabotMessage(page, "hello");

    await expect(lastChatMessage(page)).toContainText(MOCK_LLM_RESPONSE);
    await expect(lastChatMessage(page)).not.toContainText(DEFAULT_QUOTA_MESSAGE);
  });
});
