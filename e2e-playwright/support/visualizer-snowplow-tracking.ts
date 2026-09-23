/**
 * Helpers for the visualizer snowplow-tracking spec port
 * (e2e/test/scenarios/dashboard/visualizer/snowplow-tracking.cy.spec.ts).
 *
 * NEW helpers only (PORTING rule 9 / parallel-agent rule: shared modules are
 * read-only). Everything else this spec needs already exists in
 * support/visualizer-basics.ts and is imported from there rather than
 * re-implemented — the visualizer surface is already split across three files
 * and does not need a fourth split.
 *
 * Ports of the four `e2e-dashboard-visualizer-helpers.ts` helpers that no
 * previous visualizer port needed:
 *   - deselectDataset
 *   - removeDataSourceThroughMenu (H.removeDataSource's `{ throughMenu: true }`
 *     branch; visualizer-basics only ported the default branch)
 *   - toggleVisualizerSettingsSidebar
 *   - closeDashcardVisualizerModal
 * plus the ACCOUNTS_COUNT_BY_CREATED_AT fixture from
 * e2e/support/test-visualizer-data.ts.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { SAMPLE_DATABASE } from "./sample-data";
import { modal } from "./ui";
import { dataSource, type StructuredQuestionDetails } from "./visualizer-basics";

const { ACCOUNTS, ACCOUNTS_ID } = SAMPLE_DATABASE as {
  ACCOUNTS: Record<string, number>;
  ACCOUNTS_ID: number;
};

/** Port of ACCOUNTS_COUNT_BY_CREATED_AT (e2e/support/test-visualizer-data.ts). */
export const ACCOUNTS_COUNT_BY_CREATED_AT: StructuredQuestionDetails = {
  display: "bar",
  name: "Accounts by Created At (Month)",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [["field", ACCOUNTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

/**
 * Port of H.deselectDataset: search for the dataset, assert its swap button is
 * currently pressed, and click it off.
 *
 * Upstream ends with `cy.wait("@cardQuery")`. Deselecting a dataset does not
 * fetch anything — the alias is satisfied *retroactively* by an earlier card
 * query (cy.wait consumes past responses), so it enforces nothing. A literal
 * `waitForResponse` port would hang for the full timeout (PORTING: "A cy.wait
 * that follows a no-op action may be enforcing nothing"). The settle signal
 * that actually means something here is the button flipping back to
 * `aria-pressed="false"`, so that is what the port waits on.
 */
export async function deselectDataset(page: Page, datasetName: string) {
  const search = page.getByPlaceholder("Search for something");
  await search.click();
  await search.fill("");
  await search.pressSequentially(datasetName);

  const dataset = page
    .getByTestId("swap-dataset-button")
    .filter({ has: page.getByText(datasetName, { exact: true }) })
    .first();
  await expect(dataset).toHaveAttribute("aria-pressed", "true");

  await dataset.click({ force: true });
  await expect(dataset).not.toHaveAttribute("aria-pressed", "true");
}

/**
 * Port of H.removeDataSource(name, { throughMenu: true }): open the datasource
 * actions menu and pick "Remove data source".
 *
 * The hover target mirrors `resetDataSourceButton` in visualizer-basics: the
 * ellipsis is `visibility: hidden` until the header row is hovered, and the
 * list item's center sits over a column row rather than the header.
 */
export async function removeDataSourceThroughMenu(
  page: Page,
  dataSourceName: string,
) {
  const source = dataSource(page, dataSourceName);
  await source.getByText(dataSourceName, { exact: true }).first().hover();
  const actions = source.getByLabel("Datasource actions");
  await expect(actions).toBeVisible();
  await actions.click();

  const dropdown = page.getByTestId("datasource-actions-dropdown");
  await expect(dropdown).toBeVisible();
  await dropdown.getByLabel("Remove data source").click({ force: true });
}

/** Port of H.toggleVisualizerSettingsSidebar. */
export async function toggleVisualizerSettingsSidebar(page: Page) {
  await page.getByTestId("visualizer-settings-button").click();
}

/** Port of H.closeDashcardVisualizerModal. */
export async function closeDashcardVisualizerModal(page: Page) {
  await modal(page).getByTestId("visualizer-close-button").click();
}
