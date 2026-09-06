/**
 * Playwright port of e2e/test/scenarios/search/search-typeahead.cy.spec.js
 *
 * The global search-box typeahead dropdown (results appear as you type) plus the
 * command-palette fallback when inline typeahead search is disabled.
 *
 * Notes:
 * - The two "typeahead" tests run under full-app embedding
 *   (visitFullAppEmbeddingUrl in support/search.ts); all app interactions go
 *   through the returned FrameLocator, and baseUrl is mb.baseUrl (never the
 *   static BASE_URL) so it works under per-worker backends (PORTING rule 8).
 * - Typing uses pressSequentially — the dropdown is debounce/keystroke-driven,
 *   so fill() would not exercise the typeahead (PORTING rule 5).
 * - personalCollectionsLength mirrors the upstream `Object.entries(USERS).length`
 *   from e2e/support/cypress_data.js. That map has 10 users (admin, normal,
 *   nodata, sandboxed, readonly, readonlynosql, nocollection, nosql, none,
 *   impersonated), each with a personal collection in the default snapshot. The
 *   spike's own USERS map (support/sample-data.ts) is a 5-user credential subset
 *   and is deliberately NOT used for this count.
 * - findAllByText(/personal collection$/i) is a regex → matched with the same
 *   /i regex, scoped to the per-result name testid to avoid parent over-match
 *   (Playwright getByText returns nesting ancestors; testing-library matched the
 *   name text node). No new helpers needed.
 */
import { commandPalette, commandPaletteButton, commandPaletteInput } from "../support/command-palette";
import { test, expect } from "../support/fixtures";
import { getSearchBar, visitFullAppEmbeddingUrl } from "../support/search";
import type { UserName } from "../support/sample-data";

// Object.entries(USERS).length from e2e/support/cypress_data.js — see header.
const ADMIN_PERSONAL_COLLECTIONS = 10;

(["admin", "normal"] as UserName[]).forEach((user) => {
  test.describe(`search > ${user} user`, () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signIn(user);
    });

    // There was no issue for this, but it was implemented in pull request #15614
    test("should be able to use typeahead search functionality", async ({
      page,
      mb,
    }) => {
      const personalCollectionsLength =
        user === "admin" ? ADMIN_PERSONAL_COLLECTIONS : 1;

      const embed = await visitFullAppEmbeddingUrl(page, {
        url: "/",
        baseUrl: mb.baseUrl,
        qs: { top_nav: true, search: true },
      });

      // The typeahead dropdown only mounts when the SearchBar is "active",
      // which is set by a CLICK on the input container (onInputContainerClick),
      // not by focus. Cypress's .type() clicks-to-focus; pressSequentially only
      // focuses, so click first.
      await getSearchBar(embed).click();
      await getSearchBar(embed).pressSequentially("pers");

      await expect(embed.getByTestId("loading-indicator")).toHaveCount(0);

      await expect(
        embed
          .getByTestId("search-results-list")
          .getByTestId("search-result-item-name")
          .filter({ hasText: /personal collection$/i }),
      ).toHaveCount(personalCollectionsLength);
    });
  });
});

test.describe("command palette", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("search-typeahead-enabled", false);
  });

  test("should not display search results in the palette when search-typeahead-enabled is false", async ({
    page,
  }) => {
    await page.goto("/");
    await commandPaletteButton(page).click();
    await commandPaletteInput(page).pressSequentially("ord");
    await expect(
      commandPalette(page)
        .getByRole("option", { name: /View search results/ })
        .first(),
    ).toBeVisible();
  });
});
