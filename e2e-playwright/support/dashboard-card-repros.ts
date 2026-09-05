/**
 * New helpers for the dashboard-card-reproductions port.
 *
 * These are ports of `H` helpers that had no home in the existing support
 * modules; they are deliberately quarantined here rather than folded into
 * dashboard.ts / dashboard-cards.ts (the parallel-agent rule). Several are
 * consolidation candidates once the spike settles — flagged in the findings.
 */
import type { BrowserContext, Locator, Page } from "@playwright/test";

import { echartsContainer } from "./charts";
import { getDashboardCard, modal } from "./dashboard";
import { showDashboardCardActions } from "./dashboard-cards";
import { expect } from "./fixtures";
import { createNativeQuestion, createQuestion } from "./filters-repros";
import type { MetabaseApi } from "./api";
import { popover } from "./ui";

/**
 * Port of H.pieSlices (e2e-visual-tests-helpers.js): the pie/donut wedge paths
 * inside the ECharts container.
 */
export function pieSlices(page: Page): Locator {
  return echartsContainer(page).locator("path[stroke-linejoin='bevel']");
}

/**
 * Port of H.isEllipsified evaluated in the browser (negated form). The
 * positive form already lives in search.ts as assertIsEllipsified; this is
 * the missing negation (assertIsNotEllipsified) — consolidation candidate.
 */
async function isEllipsified(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const { overflowX, overflowY } = window.getComputedStyle(element);
    const verticalClips = overflowY !== "visible";
    const horizontalClips = overflowX !== "visible";
    return (
      (verticalClips && element.scrollHeight > element.clientHeight) ||
      (horizontalClips && element.scrollWidth > element.clientWidth)
    );
  });
}

/** Port of H.assertIsEllipsified (kept local so both live together). */
export async function assertIsEllipsified(locator: Locator) {
  expect(await isEllipsified(locator), "is ellipsified").toBe(true);
}

/** Port of H.assertIsNotEllipsified. */
export async function assertIsNotEllipsified(locator: Locator) {
  expect(await isEllipsified(locator), "is ellipsified").toBe(false);
}

/**
 * Port of the spec-local assertDescendantsNotOverflowDashcards +
 * H.assertDescendantNotOverflowsContainer (e2e-ui-elements-overflow-helpers.js).
 * For every dashcard, assert each matching descendant's bounding rect stays
 * within the dashcard's rect (zero-size descendants are skipped, like upstream).
 */
export async function assertDescendantsNotOverflowDashcards(
  page: Page,
  descendantsSelector: string,
) {
  const overflows = await page.evaluate((selector) => {
    const results: string[] = [];
    const dashcards = Array.from(
      document.querySelectorAll('[data-testid="dashcard"]'),
    );
    dashcards.forEach((dashcard, dashcardIndex) => {
      const containerRect = dashcard.getBoundingClientRect();
      dashcard.querySelectorAll(selector).forEach((descendant) => {
        const rect = descendant.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) {
          return;
        }
        const testid = (descendant as HTMLElement).dataset.testid;
        const label = `dashcard[${dashcardIndex}] [data-testid="${testid}"]`;
        if (rect.bottom > containerRect.bottom) {
          results.push(`${label} bottom`);
        }
        if (rect.top < containerRect.top) {
          results.push(`${label} top`);
        }
        if (rect.left < containerRect.left) {
          results.push(`${label} left`);
        }
        if (rect.right > containerRect.right) {
          results.push(`${label} right`);
        }
      });
    });
    return results;
  }, descendantsSelector);
  expect(overflows, "descendants overflowing their dashcard").toEqual([]);
}

/**
 * Port of H.grantClipboardPermissions: the Cypress helper drives CDP
 * Browser.grantPermissions; Playwright grants at the context level.
 */
export async function grantClipboardPermissions(context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
}

/** Port of H.readClipboard: read the async-clipboard text in the page. */
export function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * Port of H.toggleFilterWidgetValues (e2e-ui-elements-helpers.js): open the
 * first filter widget, click each value, then click the confirm button.
 */
export async function toggleFilterWidgetValues(
  page: Page,
  values: string[] = [],
  { buttonLabel = "Add filter" }: { buttonLabel?: string } = {},
) {
  await page.getByTestId("parameter-widget").first().click();
  const menu = popover(page);
  for (const value of values) {
    await menu.getByText(value, { exact: true }).click();
  }
  await menu.getByRole("button", { name: buttonLabel, exact: true }).click();
}

/**
 * Port of H.showDashcardVisualizerModalSettings
 * (e2e-dashboard-visualizer-helpers.ts): open the dashcard's visualizer modal,
 * wait for it to finish loading, then reveal the settings sidebar.
 */
export async function showDashcardVisualizerModalSettings(
  page: Page,
  index = 0,
  { isVisualizerCard = true }: { isVisualizerCard?: boolean } = {},
) {
  await showDashboardCardActions(page, index);
  await getDashboardCard(page, index)
    .getByLabel(isVisualizerCard ? "Edit visualization" : "Visualize another way")
    .click({ force: true });

  const dialog = modal(page);
  await expect(dialog.getByTestId("visualization-canvas-loader")).toHaveCount(0);
  await expect(
    dialog
      .getByTestId("visualizer-data-importer")
      .getByTestId("loading-indicator"),
  ).toHaveCount(0);

  await dialog.getByTestId("visualizer-settings-button").click();
}

/**
 * Port of H.saveDashcardVisualizerModal: click Save/Add-to-dashboard and wait
 * for the modal to close.
 */
export async function saveDashcardVisualizerModal(
  page: Page,
  { mode = "update" }: { mode?: "create" | "update" } = {},
) {
  await modal(page)
    .getByText(mode === "create" ? "Add to dashboard" : "Save", { exact: true })
    .click();
  await expect(modal(page)).toHaveCount(0, { timeout: 6000 });
}

/**
 * Port of H.createQuestionAndAddToDashboard (api/createQuestionAndAddToDashboard.ts):
 * create a (native or structured) question and append it to an existing
 * dashboard, preserving the dashboard's existing cards (re-reads the dashboard
 * first, like the Cypress helper). Returns the appended dashcard.
 */
export async function createQuestionAndAddToDashboard(
  api: MetabaseApi,
  query: Record<string, unknown>,
  dashboardId: number,
  card: Record<string, unknown> = {},
): Promise<{ id: number; card_id: number }> {
  const { id: card_id } =
    "native" in query
      ? await createNativeQuestion(api, query as never)
      : await createQuestion(api, query as never);

  const current = (await (
    await api.get(`/api/dashboard/${dashboardId}`)
  ).json()) as { dashcards: Record<string, unknown>[] };

  const response = await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      ...current.dashcards,
      { id: -1, card_id, row: 0, col: 0, size_x: 11, size_y: 8, ...card },
    ],
  });
  const body = (await response.json()) as {
    dashcards: { id: number; card_id: number }[];
  };
  return body.dashcards[body.dashcards.length - 1];
}
