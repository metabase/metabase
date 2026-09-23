import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import { main } from "../support/ui";
import {
  MCP_ANALYTICS_PATH,
  SEED_ERROR_CODE,
  SEED_ERROR_MESSAGE,
  SEED_ERROR_TOOL,
  SEED_ERROR_TYPE,
  SEED_TOOL_NAME,
  openToolCallsTab,
  seedMcpToolCall,
  visitMcpAnalyticsPage,
} from "../support/mcp-analytics";

// EE token gate — the MCP-analytics page and the audit DB are EE. The jar
// activates the token via cypress.env.json.
test.skip(
  !resolveToken("pro-self-hosted"),
  "requires the pro-self-hosted token",
);

test.describe("scenarios > metabot > mcp analytics", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("shows the audit-app nav item and a seeded tool call on the page", async ({
    mb,
    page,
  }) => {
    await mb.api.activateToken("pro-self-hosted");
    await seedMcpToolCall(mb.api);

    await visitMcpAnalyticsPage(page);

    // Nav item lives under the Auditing folder.
    await expect(
      page.getByRole("link", { name: "MCP analytics", exact: true }),
    ).toBeVisible();

    // The page renders with the seeded data (not the empty state).
    await expect(
      main(page).getByRole("heading", { name: "MCP analytics", exact: true }),
    ).toBeVisible();
    await expect(
      main(page).getByText("No MCP activity", { exact: true }),
    ).toHaveCount(0);

    // The seeded tool call shows up in the Events table.
    await openToolCallsTab(page);
    await expect(
      main(page).getByText(SEED_TOOL_NAME, { exact: true }),
    ).toBeVisible();
  });

  test("surfaces a failed tool call's error type and message", async ({
    mb,
    page,
  }) => {
    await mb.api.activateToken("pro-self-hosted");
    // error_message is gated PII — the backend only records/shows it when
    // retention is on.
    await mb.api.updateSetting("analytics-pii-retention-enabled", true);
    await seedMcpToolCall(mb.api, {
      tool_name: SEED_ERROR_TOOL,
      status: "error",
      error_code: SEED_ERROR_CODE,
      error_message: SEED_ERROR_MESSAGE,
    });

    await visitMcpAnalyticsPage(page);

    // The Usage tab surfaces an Errors section once there are failed calls.
    const errorsHeading = main(page).getByRole("heading", {
      name: "Errors",
      exact: true,
    });
    await errorsHeading.scrollIntoViewIfNeeded();
    await expect(errorsHeading).toBeVisible();

    // The Tool calls table shows the derived error type and gated message.
    await openToolCallsTab(page);
    for (const label of [SEED_ERROR_TOOL, SEED_ERROR_TYPE, SEED_ERROR_MESSAGE]) {
      const cell = main(page).getByText(label, { exact: true });
      await cell.scrollIntoViewIfNeeded();
      await expect(cell).toBeVisible();
    }
  });

  test("hides the nav item and the page without the audit-app feature", async ({
    page,
  }) => {
    await page.goto(MCP_ANALYTICS_PATH);

    // The MCP analytics route is not registered without audit_app.
    await expect(page.getByLabel("error page", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "MCP analytics", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "MCP analytics", exact: true }),
    ).toHaveCount(0);
  });
});
