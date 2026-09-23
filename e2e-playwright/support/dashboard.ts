/**
 * Ports of the dashboard-editing `H` helpers
 * (e2e-dashboard-helpers.ts, e2e-filter-helpers.js, e2e-collection-helpers.ts).
 *
 * Notable difference from the Cypress originals: their retry hacks
 * (editDashboard's re-click, waitForGridLayoutStable) exist because Cypress
 * can click a moving/re-rendering target. Playwright's actionability checks
 * (stable bounding box, receives-events) cover most of that, so the ports
 * start simple; add compensation only if runs prove it's needed.
 */
import { Locator, Page, expect } from "@playwright/test";

import { modal, popover } from "./ui";

export function dashboardHeader(page: Page): Locator {
  return page.getByTestId("dashboard-header");
}

export function editBar(page: Page): Locator {
  return page.getByTestId("edit-bar");
}

export function sidebar(page: Page): Locator {
  return page.locator("main aside");
}

export { modal };

export function selectDropdown(page: Page): Locator {
  return popover(page).getByRole("listbox");
}

export function getDashboardCard(page: Page, index = 0): Locator {
  return page.getByTestId("dashcard-container").nth(index);
}

export function filterWidget(page: Page): Locator {
  return page.getByTestId("parameter-widget");
}

export async function editDashboard(page: Page) {
  await page.getByLabel("Edit dashboard").click();
  await expect(page.getByText("You're editing this dashboard.")).toBeVisible();
}

/**
 * Port of H.saveDashboard — the intercept-alias pattern inverted:
 * cy.intercept(...).as() + click + cy.wait("@alias") becomes
 * "register waitForResponse promises BEFORE the click, await them after".
 *
 * `awaitRequest: false` mirrors the upstream option: saving a dashboard with
 * nothing dirty fires neither the PUT nor a query_metadata GET, so awaiting
 * either hangs until the action timeout. Upstream's caller still writes
 * `cy.wait("@saveDashboard-getDashboardMetadata")` after it, but that wait is
 * satisfied *retroactively* by an earlier response (cy.wait consumes past
 * responses — here the preceding cy.reload()'s query_metadata), so it is a
 * no-op. waitForResponse only sees future responses, so the port must skip both
 * waits and rely on the edit-bar/dashcard settling below instead.
 */
export async function saveDashboard(
  page: Page,
  { awaitRequest = true }: { awaitRequest?: boolean } = {},
) {
  const savedDashboard = awaitRequest
    ? page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          /\/api\/dashboard\/\d+/.test(new URL(response.url()).pathname),
      )
    : undefined;
  const dashboardMetadata = awaitRequest
    ? page.waitForResponse((response) =>
        /\/api\/dashboard\/\d+\/query_metadata/.test(
          new URL(response.url()).pathname,
        ),
      )
    : undefined;

  await expect(editBar(page)).toBeVisible();
  await editBar(page).getByTestId("save-edit-button").click();

  await savedDashboard;
  await dashboardMetadata;

  await expect(editBar(page)).not.toBeVisible();
  await waitForDashcardsToLoad(page);
}

export async function waitForDashcardsToLoad(page: Page) {
  const container = page.getByTestId("dashboard-parameters-and-cards");
  await expect(container).toBeVisible();
  await expect(container.getByTestId("loading-indicator")).toHaveCount(0);
}

export async function setFilter(
  page: Page,
  type: string,
  subType?: string,
  name?: string,
) {
  await dashboardHeader(page).getByLabel("Add a filter or parameter").click();
  await expect(
    popover(page).getByText("Add a filter or parameter"),
  ).toBeVisible();
  await popover(page).getByText(type, { exact: true }).click();

  if (subType) {
    // Cypress: sidebar().findByText("Filter operator").next().click()
    await sidebar(page)
      .locator(":text('Filter operator') + *")
      .click();
    await page.getByRole("listbox").getByText(subType, { exact: true }).click();
  }

  if (name) {
    await sidebar(page).getByLabel("Label").fill(name);
  }
}

export async function selectDashboardFilter(
  dashcard: Locator,
  filterName: string,
) {
  const page = dashcard.page();
  await dashcard.getByText("Select…").click();
  // exact: true — Cypress .contains() is case-sensitive ("Total" doesn't
  // match "Subtotal"), Playwright getByText isn't, so substring matching
  // here would be ambiguous. .first() — Cypress .contains() is first-match,
  // and the mapping popover can legitimately repeat a column name (e.g.
  // "Created At" under several groupings).
  await popover(page)
    .getByText(filterName, { exact: true })
    .first()
    .click({ force: true });
}

export async function setFilterListSource(
  page: Page,
  { values }: { values: (string | string[])[] },
) {
  await page.getByText("Edit", { exact: true }).click();
  const dialog = modal(page);
  await dialog.getByText("Custom list", { exact: true }).click();
  await dialog.getByRole("textbox").fill(
    values
      .map((value) => (Array.isArray(value) ? value.join(", ") : value))
      .join("\n"),
  );
  await dialog.getByRole("button", { name: "Done" }).click();
}

export async function setFilterQuestionSource(
  page: Page,
  { question, field }: { question: string; field: string },
) {
  await page.getByText("Edit", { exact: true }).click();

  const dialog = modal(page);
  await dialog.getByText("From another model or question").click();
  await dialog.getByText("Pick a model or question…").click();

  await pickEntity(page, { path: [/Our analytics/, question], select: true });

  await dialog.getByPlaceholder("Pick a column…").click();
  await selectDropdown(page)
    .getByRole("option", { name: field, exact: true, includeHidden: true })
    .click();

  await dialog.getByRole("button", { name: "Done" }).click();
}

export async function pickEntity(
  page: Page,
  { path, select }: { path?: (string | RegExp)[]; select?: boolean },
) {
  if (path) {
    const picker = page.getByTestId("nested-item-picker");
    for (const [index, name] of path.entries()) {
      await picker
        .getByTestId(`item-picker-level-${index}`)
        .getByText(name, { exact: typeof name === "string" })
        .click();
    }
  }

  if (select) {
    await page.getByTestId("entity-picker-select-button").click();
  }
}
