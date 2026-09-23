import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "../support/api";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import {
  embedModalContent,
  loadedPreviewIframe,
  navigateToEmbedOptionsStep,
} from "../support/sdk-embed-setup";
import {
  getSimpleEmbedIframe,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { popover } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/user-settings-persistence.cy.spec.ts
 *
 * Group B (the embed SETUP wizard). `support/sdk-embed-setup.ts` is consumed
 * read-only and needed no changes; like the last landed Group B specs there is
 * no companion support module — the two spec-local helpers below are direct
 * translations of upstream's spec-local `assertPreviewFinishesLoading` and
 * `reopenNewEmbedModal`.
 *
 * === AUDIT: the `getEmbedSidebar()` modal-vs-aside scope discrepancy ===
 *
 * VERDICT: **not applicable to this spec.** It never calls `getEmbedSidebar()`
 * — every locator in the original is page-scoped (`cy.findByTestId(...)`,
 * `H.popover()`, `H.getSimpleEmbedIframeContent()`), and the only `.within()`
 * in the file is `reopenNewEmbedModal`'s, which scopes to the
 * `sdk-setting-card` on `/admin/embedding` and has nothing to do with the
 * wizard modal. `getEmbedSidebar` is reached only *inside*
 * `navigateToEmbedOptionsStep`, whose usages are sidebar controls (auth radio,
 * experience card, entity button, "Next") — the case where aside and modal
 * scope are interchangeable, already proven across nine landed specs. Nothing
 * here reaches for the preview iframe through a sidebar-scoped locator, so
 * there was nothing to widen and the shared helper is untouched.
 *
 * Port notes:
 * - `H.mockEmbedJsToDevServer()` — not called by this spec at all (it is the
 *   only spec in the tier that omits it), so nothing to drop.
 * - SNOWPLOW: not the subject and not even installed — no `H.enableTracking()`,
 *   no `expectUnstructuredSnowplowEvent`, no `expectNoBadSnowplowEvents`. With
 *   `anon-tracking-enabled` left at its snapshot default there is no tracker to
 *   re-point, so this spec installs no capture (unlike its Group B siblings,
 *   which port an explicit `H.enableTracking()`).
 * - `cy.wait("@persistSettings")` (rule 2 + the "key a retroactive recorder on
 *   WHICH response, never a count" rule). The alias is registered in the
 *   `beforeEach`, but the wizard PUTs
 *   `/api/setting/sdk-iframe-embed-setup-settings` on *every* settings change,
 *   and `getSettingsToPersist` (use-sdk-iframe-embed-settings.ts) sends `{}`
 *   whenever no theme is selected — so several such PUTs have already fired by
 *   the time upstream's `cy.wait` runs, and it is satisfied retroactively by
 *   one of those. A bare `waitForResponse` on the pathname would be a gate that
 *   proves nothing. Instead a passive recorder collects every persist body and
 *   each test polls for the SPECIFIC persist it cares about: the brand colour
 *   for test 1, the saved theme's id for test 2. Strictly stronger than the
 *   original, and it cannot resolve off an unrelated `{}` PUT.
 * - `cy.findByDisplayValue("#509EE2")` → the shared imperative
 *   `findByDisplayValue` scan (Playwright 1.61.1's types omit
 *   `getByDisplayValue`).
 * - `.clear().type(...)` — **`cy.type()` clicks its subject first**, so the
 *   port clicks the input before typing. Real keystrokes rather than `fill()`
 *   because the Mantine ColorInput parses/normalises as you type.
 * - ABSENCE: `findByTestId("preview-loading-indicator").should("not.exist")`
 *   and `…modal-content").should("not.exist")` → retrying `toHaveCount(0)`,
 *   the faithful equivalent. Neither is vacuous: the loading indicator check is
 *   anchored by the immediately preceding `[data-iframe-loaded]` count-1
 *   assertion (upstream's own anchor — and the stuck-loader bug this test
 *   regresses leaves the iframe loaded *and* the overlay mounted, so the
 *   anchor is present in both variants), and the modal check is anchored by the
 *   `reopenNewEmbedModal` click that immediately follows, which can only find
 *   its target on the re-rendered `/admin/embedding` page.
 */

const DASHBOARD_NAME = "Orders in a dashboard";

const SAVED_THEME_NAME = "Sunset";

type EmbeddingTheme = { id: number; name: string };

/** Port of `seedSavedTheme`. */
async function seedSavedTheme(api: MetabaseApi): Promise<EmbeddingTheme> {
  const response = await api.post("/api/embed-theme", {
    name: SAVED_THEME_NAME,
    settings: {
      colors: {
        brand: "#FF0000",
        // Distinct chart colors are what makes the preview container remount
        // once the saved theme resolves — see the regression test below.
        charts: [
          "#FF0000",
          "#FF7F00",
          "#FFD400",
          "#00A86B",
          "#0080FF",
          "#3F00FF",
          "#8B00FF",
          "#FF00AA",
        ],
      },
    },
  });

  return (await response.json()) as EmbeddingTheme;
}

/** Port of `assertPreviewFinishesLoading`. */
async function assertPreviewFinishesLoading(page: Page) {
  await expect(loadedPreviewIframe(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId("preview-loading-indicator")).toHaveCount(0);
}

/** Port of `reopenNewEmbedModal`. Upstream's `.within()` scopes the
 * "New embed" lookup to the first setting card; the click lands on the
 * `findByText` result either way. */
async function reopenNewEmbedModal(page: Page) {
  await page
    .getByTestId(/(sdk-setting-card|guest-embeds-setting-card)/)
    .first()
    .getByText("New embed", { exact: true })
    .click();
}

/**
 * Port of `H.getSimpleEmbedIframeContent()`'s gate-then-scope shape: the
 * Cypress helper retries until `iframe[data-metabase-embed]` AND
 * `iframe[data-iframe-loaded]` exist before scoping into the frame, so a bare
 * `getSimpleEmbedIframe(page)` would drop the "the preview finished loading"
 * half. Re-run at every use site — the wizard re-mounts the preview when the
 * theme changes.
 */
async function firstPreviewCell(page: Page): Promise<Locator> {
  await waitForSimpleEmbedIframesToLoad(page);
  return getSimpleEmbedIframe(page).getByTestId("cell-data").first();
}

type PersistedSettings = {
  theme?: { id?: number; colors?: Record<string, string> };
};

/**
 * Port of `cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings")
 * .as("persistSettings")` — see the header for why this is a recorder rather
 * than a `waitForResponse`.
 */
function recordPersistedSettings(page: Page): PersistedSettings[] {
  const bodies: PersistedSettings[] = [];

  page.on("request", (request) => {
    if (request.method() !== "PUT") {
      return;
    }
    if (
      new URL(request.url()).pathname !==
      "/api/setting/sdk-iframe-embed-setup-settings"
    ) {
      return;
    }

    const data = request.postDataJSON() as
      | { value?: PersistedSettings }
      | PersistedSettings
      | null;

    if (data && typeof data === "object") {
      bodies.push(
        ("value" in data ? data.value : (data as PersistedSettings)) ?? {},
      );
    }
  });

  return bodies;
}

async function waitForPersist(
  bodies: PersistedSettings[],
  predicate: (body: PersistedSettings) => boolean,
) {
  await expect
    .poll(() => bodies.some(predicate), { timeout: 20_000 })
    .toBe(true);
}

/** The ColorInput normalises what the user typed, so accept any spelling of
 * pure red rather than pinning the stored representation. */
function isRed(color: string | undefined): boolean {
  return (
    color !== undefined &&
    /^(#ff0000|#f00|rgba?\(\s*255\s*,\s*0\s*,\s*0\s*(,\s*1\s*)?\))$/i.test(
      color.trim(),
    )
  );
}

test.describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("enable-embedding-simple", true);
  });

  test("persists brand colors", async ({ page }) => {
    const persisted = recordPersistedSettings(page);

    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    // 0. select custom colors
    await page.getByTestId("theme-card-Custom").click();

    // 1. change brand color to red
    await page.getByTestId("brand-color-picker").getByRole("button").click();

    const colorInput = await findByDisplayValue(popover(page), "#509EE2");
    await expect(colorInput).toBeVisible();
    await colorInput.clear();
    // cy.type() clicks its subject before sending keystrokes.
    await colorInput.click();
    await colorInput.pressSequentially("rgb(255, 0, 0)");
    await colorInput.blur();

    await expect(await firstPreviewCell(page)).toHaveCSS(
      "color",
      "rgb(255, 0, 0)",
    );

    // Wait for debounce (USER_SETTINGS_DEBOUNCE_MS = 800)
    await page.waitForTimeout(800);

    // 2. reload the page
    await waitForPersist(persisted, (body) => isRed(body.theme?.colors?.brand));

    // 3. brand color should be persisted
    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    await expect(await firstPreviewCell(page)).toHaveCSS(
      "color",
      "rgb(255, 0, 0)",
    );
  });

  test("finishes loading the preview when a persisted saved theme is restored on reopen", async ({
    page,
    mb,
  }) => {
    const persisted = recordPersistedSettings(page);

    const savedTheme = await seedSavedTheme(mb.api);

    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    // select a saved theme (anything other than the instance theme)
    await page.getByTestId(`theme-card-${SAVED_THEME_NAME}`).click();

    await waitForPersist(persisted, (body) => body.theme?.id === savedTheme.id);

    // the preview loads with the selected theme applied
    await assertPreviewFinishesLoading(page);

    // close the New embed modal
    await embedModalContent(page)
      .getByLabel("Close", { exact: true })
      .click();
    await expect(embedModalContent(page)).toHaveCount(0);

    // reopen the New embed modal
    await reopenNewEmbedModal(page);

    // the preview must finish loading — the restored saved theme must not
    // leave it stuck on the loader
    await assertPreviewFinishesLoading(page);
  });
});
