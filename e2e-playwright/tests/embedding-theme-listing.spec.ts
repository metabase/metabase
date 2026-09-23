/**
 * Playwright port of
 * e2e/test/scenarios/embedding/embedding-theme-editor/theme-listing.cy.spec.ts —
 * the static-embedding saved-themes listing (/admin/embedding/themes): lazy
 * seeding of Light/Dark defaults, empty state, the New-theme draft flow,
 * navigating to the editor, and duplicating/deleting themes.
 *
 * Porting notes:
 * - EE + token-gated: the whole describe is skipped without a pro-self-hosted
 *   token; the jar activates it in beforeEach (H.activateToken).
 * - findByText / findByLabelText / findByRole(menuitem) string args are exact
 *   (rule 1); the /New theme/, /Cancel/, /Delete/ role names stay regexes
 *   (upstream used regex → substring).
 * - `should("not.exist")` → toHaveCount(0); `cy.url().should("match")` retried
 *   → expect.poll (rule: hash/URL assertions Cypress retried must be poll).
 * - `cy.get("@createTheme.all").should("have.length", 0)` (assert NO POST was
 *   issued) → a page.on("request") counter checked at the end; there is no
 *   response to wait for, so the intercept becomes a passive request tally.
 * - `cy.wait("@createTheme")` reads the request body → waitForResponse
 *   registered before the Save click (rule 2), body from request().postDataJSON().
 * - undoToast text → filter({hasText}).first() (transient-UI strict-mode rule;
 *   an earlier toast may linger).
 * - createThemeViaApi reused read-only from support/embedding-theme-editor.ts;
 *   listing-specific helpers live in support/embedding-theme-listing.ts.
 */
import { resolveToken } from "../support/api";
import { createThemeViaApi } from "../support/embedding-theme-editor";
import {
  clickThemeMenuItem,
  deleteAllThemes,
  getThemeCard,
  openThemeActionMenu,
} from "../support/embedding-theme-listing";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { main } from "../support/ui";

test.describe("scenarios > embedding > themes > theme listing", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("lazily seeds Light and Dark on first visit, and preserves admin deletions across reloads", async ({
    page,
    mb,
  }) => {
    await page.goto("/admin/embedding/themes");

    // default Light and Dark themes are seeded lazily on first visit
    await expect(main(page).getByText("Light", { exact: true })).toBeVisible();
    await expect(main(page).getByText("Dark", { exact: true })).toBeVisible();

    // new theme card is visible
    await expect(
      main(page).getByRole("button", { name: /New theme/ }),
    ).toBeVisible();

    // admin deletes the seeded defaults
    await deleteAllThemes(mb.api);
    await page.reload();

    // empty state is shown; defaults are not re-created
    await expect(main(page).getByText("Light", { exact: true })).toHaveCount(0);
    await expect(main(page).getByText("Dark", { exact: true })).toHaveCount(0);

    // clicking New theme navigates to the draft editor
    await main(page).getByRole("button", { name: /New theme/ }).click();

    await expect
      .poll(() => page.url())
      .toMatch(/\/admin\/embedding\/themes\/new$/);
  });

  test("does not create a theme when cancelling from the draft editor", async ({
    page,
  }) => {
    let createThemeCount = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/embed-theme"
      ) {
        createThemeCount += 1;
      }
    });

    await page.goto("/admin/embedding/themes");

    await main(page).getByRole("button", { name: /New theme/ }).click();

    await expect
      .poll(() => page.url())
      .toMatch(/\/admin\/embedding\/themes\/new$/);

    await page.getByRole("button", { name: /Cancel/ }).click();

    // navigates back to the listing
    await expect
      .poll(() => page.url())
      .toMatch(/\/admin\/embedding\/themes$/);

    // new theme card is still visible
    await expect(
      main(page).getByRole("button", { name: /New theme/ }),
    ).toBeVisible();

    // no POST was issued
    expect(createThemeCount).toBe(0);
  });

  test("navigates to theme editor when clicking an existing theme card", async ({
    page,
    mb,
  }) => {
    await createThemeViaApi(mb.api, "My theme");
    await page.goto("/admin/embedding/themes");

    await main(page).getByText("My theme", { exact: true }).click();

    // navigates to the theme editor page
    await expect.poll(() => page.url()).toMatch(/\/admin\/embedding\/themes\/\d+/);
  });

  test("uses white-labeled colors as a base for creating themes", async ({
    page,
    mb,
  }) => {
    const whitelabelColors = {
      brand: "#8e44ad",
      filter: "#16a085",
      summarize: "#d35400",
      accent0: "#e74c3c",
      accent7: "#34495e",
    };

    await mb.api.updateSetting("application-colors", whitelabelColors);

    const createTheme = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/embed-theme",
    );

    await page.goto("/admin/embedding/themes");

    await main(page).getByRole("button", { name: /New theme/ }).click();

    await page.getByRole("button", { name: /Save theme/ }).click();

    const body = (await createTheme).request().postDataJSON() as {
      name: string;
      settings: {
        colors?: { brand?: string; filter?: string; summarize?: string; charts?: string[] };
      };
    };

    expect(body.name).toBe("Untitled theme");

    // We capture a snapshot of the current white-labeled colors when creating
    // themes. The internal BI's whitelabeled colors may differ from the
    // embedding colors, so this stays fixed as the appearance settings change.
    expect(body.settings.colors?.brand).toBe(whitelabelColors.brand);
    expect(body.settings.colors?.filter).toBe(whitelabelColors.filter);
    expect(body.settings.colors?.summarize).toBe(whitelabelColors.summarize);
    expect(body.settings.colors?.charts?.[0]).toBe(whitelabelColors.accent0);
    expect(body.settings.colors?.charts?.[7]).toBe(whitelabelColors.accent7);
  });

  test("can duplicate a theme", async ({ page, mb }) => {
    await createThemeViaApi(mb.api, "Untitled theme");
    await page.goto("/admin/embedding/themes");

    await expect(
      main(page).getByText("Untitled theme", { exact: true }),
    ).toBeVisible();

    // duplicate a theme
    await clickThemeMenuItem(page, "Untitled theme", "Duplicate");

    await expect(
      undoToast(page)
        .filter({ hasText: "Theme duplicated successfully" })
        .first(),
    ).toBeVisible();

    // duplicated theme should have 'Copy of' prepended
    const original = main(page).getByText("Untitled theme", { exact: true });
    await original.scrollIntoViewIfNeeded();
    await expect(original).toBeVisible();
    await expect(
      main(page).getByText("Copy of Untitled theme", { exact: true }),
    ).toBeVisible();
  });

  test("can delete a theme with confirmation", async ({ page, mb }) => {
    await createThemeViaApi(mb.api, "Untitled theme");
    await page.goto("/admin/embedding/themes");

    await expect(
      main(page).getByText("Untitled theme", { exact: true }),
    ).toBeVisible();

    // delete a theme
    await clickThemeMenuItem(page, "Untitled theme", "Delete");

    // delete confirmation modal should appear
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Delete theme", { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        "Are you sure you want to delete this theme? This action cannot be undone.",
        { exact: true },
      ),
    ).toBeVisible();

    // cancel the deletion
    await dialog.getByRole("button", { name: /Cancel/ }).click();

    // theme should still exist
    await expect(
      main(page).getByText("Untitled theme", { exact: true }),
    ).toBeVisible();

    await openThemeActionMenu(page, "Untitled theme");

    // confirm deletion
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Delete/ })
      .click();

    await expect(
      undoToast(page)
        .filter({ hasText: "Theme deleted successfully" })
        .first(),
    ).toBeVisible();

    // deleted theme is gone; default themes and new theme card remain
    await expect(
      main(page).getByText("Untitled theme", { exact: true }),
    ).toHaveCount(0);
    await expect(main(page).getByText("Light", { exact: true })).toBeVisible();
    await expect(main(page).getByText("Dark", { exact: true })).toBeVisible();
    await expect(
      main(page).getByRole("button", { name: /New theme/ }),
    ).toBeVisible();
  });
});
