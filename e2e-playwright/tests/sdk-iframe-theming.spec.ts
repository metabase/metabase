import type { FrameLocator } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID, ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  loadSdkIframeEmbedTestPage,
  prepareSdkIframeEmbedTest,
  waitForSimpleEmbedIframesToLoad,
} from "../support/sdk-iframe";
import { waitForCardQuery } from "../support/sdk-iframe-embedding";
import { waitForDashboardGet } from "../support/sdk-iframe-eajs-internal-navigation";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding/theming.cy.spec.ts
 *
 * (Group A — the embed.js harness, `support/sdk-iframe.ts`, consumed
 * read-only. No harness changes were needed.)
 *
 * Port notes:
 *
 * - `cy.wait("@getDashboard")` / `@getCardQuery` are aliases registered by
 *   `H.prepareSdkIframeEmbedTest` (`GET /api/dashboard/:id`,
 *   `POST /api/card/:id/query`). The Playwright harness deliberately does not
 *   register them (PORTING rule 2), so each test arms its own wait immediately
 *   BEFORE `loadSdkIframeEmbedTestPage` triggers the load. `waitForDashboardGet`
 *   and `waitForCardQuery` are imported from the sibling support modules rather
 *   than re-declared (they are already flagged for consolidation into
 *   `support/sdk-iframe.ts`).
 *
 * - `H.loadSdkIframeEmbedTestPage` blocks until the embed iframe exists and its
 *   body is non-empty; the Playwright port returns a lazy `FrameLocator`
 *   immediately. Each test therefore calls `waitForSimpleEmbedIframesToLoad`
 *   to restore that gate before measuring anything.
 *
 * - Upstream types the theme literals with
 *   `satisfies MetabaseTheme` (`metabase/embedding-sdk/theme/MetabaseTheme`).
 *   That path is not resolvable from this package's tsconfig (no `paths` into
 *   the app source, and pulling the app's type graph in is what OOMs a
 *   repo-root tsc), so the `satisfies` clause is dropped. It is a compile-time
 *   annotation only — the values sent to `defineMetabaseConfig` are identical.
 *
 * - Colour assertions are ported as `toHaveCSS`, the direct analogue of
 *   `should("have.css", prop, value)`. Both compare against the *computed*
 *   value; every expected literal here is already in the canonical
 *   `rgb(r, g, b)` form Chromium serialises to, so no parsing is needed. These
 *   assert the computed property the theme actually drives (background-color /
 *   color), not a class name — CSS-module class names are minified in the jar
 *   (PORTING: "never select on a CSS-module class name").
 *
 * - No skips or gates: the whole file runs on a bleeding-edge token, which the
 *   spike backend has. 3 tests, 3 executed.
 */

const LIGHT_THEME = {
  colors: {
    brand: "rgb(156, 39, 176)",
    "text-primary": "rgb(45, 59, 69)",
    "text-secondary": "rgb(124, 136, 150)",
    "text-tertiary": "rgb(184, 187, 195)",
  },
} as const;

const DARK_THEME = {
  colors: {
    brand: "rgb(255, 87, 51)",
    "text-primary": "rgb(255, 255, 255)",
    "text-secondary": "rgb(200, 205, 210)",
    "text-tertiary": "rgb(184, 187, 195)",
    background: "rgb(39, 39, 59)",
    border: "rgb(184, 187, 195)",
  },
  components: {
    table: { cell: { backgroundColor: "rgb(39, 39, 59)" } },
  },
} as const;

/**
 * Port of upstream's
 *   cy.findAllByTestId("header-cell").filter(":contains('Product ID')").first()
 *   .then($el => $el[0].getBoundingClientRect().width)
 *
 * `filter({ hasText })` with a *regex* is a case-sensitive substring match,
 * matching jQuery's `:contains()`; the string form would be case-insensitive.
 * The width is read with the element's own `getBoundingClientRect()` — the same
 * call upstream makes — rather than `boundingBox()`, so the measurement is
 * taken in the frame's own coordinate space and does not depend on the cell
 * being visible to Playwright's actionability rules.
 */
async function productIdHeaderCellWidth(frame: FrameLocator): Promise<number> {
  const cell = frame
    .getByTestId("header-cell")
    .filter({ hasText: /Product ID/ })
    .first();

  // Anchor the measurement on a painted cell. `evaluate` auto-waits for the
  // element to be *attached*, which is not enough to guarantee the column has
  // been laid out; Cypress's retry of the whole `findAllByTestId` chain plus
  // its command-queue latency supplied that settle implicitly.
  await expect(cell).toBeVisible({ timeout: 40_000 });

  return cell.evaluate((element) => element.getBoundingClientRect().width);
}

test.describe("scenarios > embedding > sdk iframe embedding > theming", () => {
  test.beforeEach(async ({ page, mb }) => {
    await prepareSdkIframeEmbedTest(page, mb, { signOut: true });
  });

  test("should apply custom themes", async ({ page, mb }) => {
    const getDashboard = waitForDashboardGet(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        theme: DARK_THEME,
      },
    });

    await getDashboard;
    await waitForSimpleEmbedIframesToLoad(page);

    await expect(frame.getByTestId("dashboard")).toHaveCSS(
      "background-color",
      DARK_THEME.colors.background,
    );

    await expect(
      frame.getByText("Showing first 2,000 rows", { exact: true }),
    ).toHaveCSS("color", DARK_THEME.colors["text-primary"]);

    await expect(frame.getByText("Product ID", { exact: true })).toHaveCSS(
      "color",
      DARK_THEME.colors.brand,
    );
  });

  test("should measure table column widths based on themed font size", async ({
    page,
    mb,
  }) => {
    const SMALL_FONT_THEME = {
      components: {
        table: { cell: { fontSize: "10px" } },
      },
    } as const;

    // 1. load with default theme and measure column width
    const defaultCardQuery = waitForCardQuery(page);

    const defaultFrame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: ORDERS_QUESTION_ID },
        },
      ],
    });

    await defaultCardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    const defaultColumnWidth = await productIdHeaderCellWidth(defaultFrame);
    expect(defaultColumnWidth).toBeGreaterThan(0);

    // 2. load with smaller font theme and verify column is narrower
    const themedCardQuery = waitForCardQuery(page);

    const themedFrame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-question",
          attributes: { questionId: ORDERS_QUESTION_ID },
        },
      ],
      metabaseConfig: {
        theme: SMALL_FONT_THEME,
      },
    });

    await themedCardQuery;
    await waitForSimpleEmbedIframesToLoad(page);

    const themedColumnWidth = await productIdHeaderCellWidth(themedFrame);
    expect(themedColumnWidth).toBeLessThan(defaultColumnWidth);
  });

  test("should handle dynamic theme updates", async ({ page, mb }) => {
    const THEME_SWITCHER_HTML = `
      <div>
        <button onclick="setLightTheme()" style="margin: 5px;">Light</button>
        <button onclick="setDarkTheme()" style="margin: 5px;">Dark</button>
      </div>

      <script>
        const LIGHT_THEME = ${JSON.stringify(LIGHT_THEME)};
        const DARK_THEME = ${JSON.stringify(DARK_THEME)};

        function setLightTheme() {
          defineMetabaseConfig({ theme: LIGHT_THEME });
        }

        function setDarkTheme() {
          defineMetabaseConfig({ theme: DARK_THEME });
        }
      </script>
    `;

    const getDashboard = waitForDashboardGet(page);

    const frame = await loadSdkIframeEmbedTestPage(page, mb, {
      elements: [
        {
          component: "metabase-dashboard",
          attributes: {
            dashboardId: ORDERS_DASHBOARD_ID,
          },
        },
      ],
      metabaseConfig: {
        theme: LIGHT_THEME,
      },
      insertHtml: { beforeEmbed: THEME_SWITCHER_HTML },
    });

    await getDashboard;
    await waitForSimpleEmbedIframesToLoad(page);

    // 1. verify colors in light theme
    await assertLightTheme(frame);

    // 2. switch to dark theme and verify colors
    await page.getByText("Dark", { exact: true }).click();

    await expect(frame.getByTestId("dashboard")).toHaveCSS(
      "background-color",
      DARK_THEME.colors.background,
    );

    await expect(frame.getByTestId("dashboard-header-container")).toHaveCSS(
      "background-color",
      DARK_THEME.colors.background,
    );

    await expect(frame.getByText("Product ID", { exact: true })).toHaveCSS(
      "color",
      DARK_THEME.colors.brand,
    );

    await expect(
      frame.getByText("Showing first 2,000 rows", { exact: true }),
    ).toHaveCSS("color", DARK_THEME.colors["text-primary"]);

    // 3. switch to light theme and verify colors
    await page.getByText("Light", { exact: true }).click();

    await assertLightTheme(frame);
  });
});

/**
 * The light-theme block upstream repeats verbatim at steps 1 and 3 of
 * "should handle dynamic theme updates". Cypress already has exactly one shape
 * here (the two blocks are identical), so factoring them is faithful.
 * `rgb(255, 255, 255)` is upstream's literal — LIGHT_THEME declares no
 * `background`, so the default white is the expectation.
 */
async function assertLightTheme(frame: FrameLocator) {
  await expect(frame.getByTestId("dashboard")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );

  await expect(frame.getByTestId("dashboard-header-container")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );

  await expect(frame.getByText("Product ID", { exact: true })).toHaveCSS(
    "color",
    LIGHT_THEME.colors.brand,
  );

  await expect(
    frame.getByText("Showing first 2,000 rows", { exact: true }),
  ).toHaveCSS("color", LIGHT_THEME.colors["text-primary"]);
}
