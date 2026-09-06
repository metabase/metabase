/**
 * Playwright port of e2e/test/scenarios/onboarding/onboarding-checklist.cy.spec.ts
 *
 * - The ChecklistItemValue type import (frontend source) is outside this
 *   project's tsconfig include; the item list is inlined `as const` instead.
 * - "Inaccessible" describe needs the pro-self-hosted token (full-app
 *   embedding + whitelabeling are EE features).
 */
import { resolveToken } from "../support/api";
import { getHelpSubmenu } from "../support/command-palette";
import { test, expect } from "../support/fixtures";
import { expectPathname } from "../support/onboarding";
import { embedFrame, visitFullAppEmbeddingUrl } from "../support/search";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { popover } from "../support/ui";

test.describe("Onboarding checklist page", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
    await page.goto("/getting-started");
  });

  test("should let non-admins access this page", async ({ page }) => {
    const accordion = page.locator("[data-accordion=true]");

    await expect(
      accordion.getByRole("heading", {
        name: "Start visualizing your data",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      accordion.getByText(
        /Hover over a table and click the yellow lightning bolt/,
      ),
    ).toBeVisible();

    await accordion
      .getByText("Make an interactive chart with the query builder", {
        exact: true,
      })
      .click();
    await expect(
      accordion.getByText(
        /Filter and summarize data, add custom columns, join data from other tables, and more/,
      ),
    ).toBeVisible();
    await expect(
      accordion.getByText(
        /Hover over a table and click the yellow lightning bolt/,
      ),
    ).toBeHidden();
  });
});

test.describe("Inaccessible Onboarding checklist", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should not render when embedded in an iframe", async ({
    page,
    mb,
  }) => {
    const frame = await visitFullAppEmbeddingUrl(page, {
      url: "/",
      qs: {},
      baseUrl: mb.baseUrl,
    });
    const navbar = frame.getByTestId("main-navbar-root");
    await expect(
      navbar.getByRole("listitem", { name: "Home", exact: true }),
    ).toBeVisible();
    await expect(
      navbar.getByRole("listitem", {
        name: "How to use Metabase",
        exact: true,
      }),
    ).toHaveCount(0);

    // Redirects to the home page
    await visitFullAppEmbeddingUrl(page, {
      url: "/getting-started",
      qs: {},
      baseUrl: mb.baseUrl,
    });
    await embedFrame(page).waitForURL((url) => url.pathname === "/");
  });

  test("should not render when the instance is whitelabelled", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("application-name", "Acme, corp.");

    await page.goto("/");
    const navbar = page.getByTestId("main-navbar-root");
    await expect(
      navbar.getByRole("listitem", { name: "Home", exact: true }),
    ).toBeVisible();
    await expect(
      navbar.getByRole("listitem", {
        name: "How to use Metabase",
        exact: true,
      }),
    ).toHaveCount(0);

    // Redirects to the home page
    await page.goto("/getting-started");
    await expectPathname(page, "/");

    // The link should not exist in the main settings menu either
    await page.getByLabel("Settings menu", { exact: true }).click();
    await popover(page).getByText("Help", { exact: true }).click();

    const helpSubmenu = getHelpSubmenu(page);
    await expect(helpSubmenu).toContainText("About Acme, corp.");
    await expect(helpSubmenu).not.toContainText("How to use Metabase");
  });
});

test.describe("Onboarding checklist events", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await resetSnowplow(mb);
    await enableTracking(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test('should track clicking on "How to use Metabase" button', async ({
    page,
    mb,
  }) => {
    await page.goto("/");
    await page
      .getByTestId("main-navbar-root")
      .getByRole("listitem", { name: "How to use Metabase", exact: true })
      .click();
    await expectPathname(page, "/getting-started");
    await expectUnstructuredSnowplowEvent(mb, {
      event: "onboarding_checklist_opened",
    });
  });

  test.describe("Onboarding checklist page", () => {
    test("should track each item when expanded", async ({ page, mb }) => {
      // ChecklistItemValue values, inlined (see spec header).
      const items = [
        "invite",
        "database",
        "x-ray",
        "notebook",
        "sql",
        "dashboard",
        "subscription",
        "alert",
      ] as const;

      await page.goto("/getting-started");

      for (const item of items) {
        await page.getByTestId(`${item}-item`).click();
        await expectUnstructuredSnowplowEvent(mb, {
          event: "onboarding_checklist_item_expanded",
          triggered_from: item,
        });
      }
    });

    test("should track individual items' cta(s) when clicked", async ({
      page,
      mb,
    }) => {
      await page.goto("/getting-started");
      // Not strictly necessary but reduces the flakiness by allowing the page to load fully
      await expect(
        page
          .getByTestId("main-navbar-root")
          .getByRole("listitem", { name: "How to use Metabase", exact: true }),
      ).toHaveAttribute("aria-selected", "true");

      await page
        .getByTestId("database-cta")
        .getByRole("button", { name: "Add Database", exact: true })
        .click();
      await expectUnstructuredSnowplowEvent(mb, {
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "database",
        event_detail: "primary",
      });

      await page.goBack();

      await page.getByTestId("invite-item").click();
      await page
        .getByTestId("invite-cta")
        .getByRole("button", { name: "Invite people", exact: true })
        .click();
      await expectUnstructuredSnowplowEvent(mb, {
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "primary",
      });

      await page.goBack();

      await page
        .getByTestId("invite-cta")
        .getByRole("button", { name: "Set up Single Sign-on", exact: true })
        .click();
      await expectUnstructuredSnowplowEvent(mb, {
        event: "onboarding_checklist_cta_clicked",
        triggered_from: "invite",
        event_detail: "secondary",
      });
    });
  });
});
