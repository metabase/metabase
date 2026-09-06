/**
 * Playwright port of e2e/test/scenarios/metabot/mcp-apps-settings.cy.spec.ts
 *
 * Admin > MCP apps settings: the "Install in Cursor" deeplink appears only when
 * the "Cursor and VS Code" switch is on, carries a valid cursor:// deeplink
 * whose config decodes to this instance's /api/metabase-mcp URL, is hoverable
 * (the switch track does not cover it), and clicking it does not toggle the
 * parent switch.
 *
 * Port notes:
 * - EE/token-gated. The MCP admin section is mounted only behind
 *   hasPremiumFeature("metabot-v3") (enterprise/.../metabot/index.ts), so the
 *   port activates "pro-self-hosted" and skips when the token env var is
 *   missing. The Cypress original relies on CI's already-licensed backend.
 * - The deeplink URL is built from the `site-url` setting
 *   (admin/ai/useMCPServerURL.ts). Slot backends boot with MB_SITE_URL =
 *   mb.baseUrl, so the expected URL is `${mb.baseUrl}/api/metabase-mcp` — use
 *   mb.baseUrl (PORTING rule 8 / per-worker-backend note), never a static
 *   Cypress.config("baseUrl").
 * - Mantine Switch: click the role="switch" input with { force: true }
 *   (PORTING rule 4).
 * - realHover + mouseenter probe and the preventDefault click are factored into
 *   support/mcp-apps-settings.ts.
 */
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import {
  clickLinkWithoutFollowing,
  pointerReachesLink,
} from "../support/mcp-apps-settings";
import { main } from "../support/ui";

test.describe("admin > MCP apps settings > Cursor install link", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("shows 'Install in Cursor' link only when the Cursor and VS Code switch is enabled", async ({
    page,
    mb,
  }) => {
    await page.goto("/admin/metabot/mcp");

    const scope = main(page);
    const link = scope.getByRole("link", {
      name: "Install in Cursor",
      exact: true,
    });
    const cursorSwitch = scope.getByRole("switch", {
      name: /cursor and vs code/i,
    });

    await scope
      .getByText("Show inline charts in these MCP clients", { exact: true })
      .scrollIntoViewIfNeeded();

    // link is hidden by default
    await expect(link).toHaveCount(0);

    // enable Cursor and VS Code
    await cursorSwitch.click({ force: true });

    // link appears with a valid Cursor deeplink
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");

    expect(typeof href).toBe("string");
    expect(href).toMatch(
      /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?/,
    );

    const query = (href as string).split("?", 2)[1];
    const params = new URLSearchParams(query);

    expect(params.get("name")).toBe("Metabase");
    const config = params.get("config");

    expect(typeof config).toBe("string");

    const decoded = JSON.parse(atob(config as string));

    expect(decoded.url).toBe(`${mb.baseUrl}/api/metabase-mcp`);

    // link is hoverable — pointer events reach it (not the switch track)
    expect(await pointerReachesLink(page, link)).toBe(true);

    // clicking the link does not toggle the parent switch
    await clickLinkWithoutFollowing(link);
    await expect(cursorSwitch).toBeChecked();

    // disable Cursor and VS Code
    await cursorSwitch.click({ force: true });

    // link is hidden again
    await expect(link).toHaveCount(0);
  });
});
