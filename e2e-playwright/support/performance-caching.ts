/**
 * Helpers for the performance-caching port
 * (e2e/test/scenarios/admin/performance/caching.cy.spec.ts).
 *
 * Ports of e2e/support/helpers/e2e-caching-helpers.ts
 * (cacheStrategySidesheet / cacheStrategySelect / selectCacheStrategy) plus the
 * spec-local helpers (saveCacheStrategyForm / openSidebarCacheStrategyForm /
 * cancelConfirmationModal / the preemptive-caching switch).
 *
 * Shared surface is imported read-only: openQuestionActions (models.ts),
 * openDashboardSettingsSidebar (dashboard-repros.ts), popover (ui.ts).
 */
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { openDashboardSettingsSidebar } from "./dashboard-repros";
import { expect } from "./fixtures";
import { openQuestionActions } from "./models";

/**
 * Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). Derived
 * by question name (as the Cypress export is), since sample-data.ts exports
 * ORDERS_QUESTION_ID but not this one.
 */
export const ORDERS_COUNT_QUESTION_ID: number = (() => {
  const question = (
    SAMPLE_INSTANCE_DATA.questions as { name: string; id: number | string }[]
  ).find((entity) => entity.name === "Orders, Count");
  if (!question) {
    throw new Error(
      'Entity "Orders, Count" not found in cypress_sample_instance_data',
    );
  }
  return Number(question.id);
})();

/** Any scope that exposes `.getByTestId` — a Page or a scoped Locator. */
type Scope = Page | Locator;

/**
 * Port of H.cacheStrategySidesheet: the caching-settings dialog. Returned as a
 * Locator so callers can chain (the Cypress `.should("be.visible")` is applied
 * by callers that need it).
 */
export function cacheStrategySidesheet(page: Page): Locator {
  return page.getByRole("dialog", { name: /Caching settings/ });
}

/**
 * Port of H.cacheStrategySelect: the strategy dropdown inside the invalidation
 * form. The Mantine Select applies its data-testid to the input, so the value
 * is readable with toHaveValue.
 */
export function cacheStrategySelect(page: Page): Locator {
  return cacheStrategyForm(page).getByTestId("cache-strategy-select");
}

/** The strategy invalidation form. findByRole name string → exact (rule 1). */
export function cacheStrategyForm(page: Page): Locator {
  return page.getByRole("form", {
    name: "Select the cache invalidation policy",
    exact: true,
  });
}

/**
 * Port of H.selectCacheStrategy: open the strategy dropdown and pick an option
 * by title. Options render in a portal at the document root, so they are
 * resolved from the page, never a scoped form/sidesheet locator.
 */
export async function selectCacheStrategy(page: Page, name: RegExp) {
  await cacheStrategySelect(page).click();
  await page.getByRole("option", { name }).click();
}

/**
 * Port of the spec-local saveCacheStrategyForm: click Save in the invalidation
 * form and wait for the PUT /api/cache it fires. `cy.button(/Save/)` →
 * getByRole("button", { name: /Save/ }).
 */
export async function saveCacheStrategyForm(page: Page) {
  const putConfig = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/cache",
  );
  await cacheStrategyForm(page)
    .getByRole("button", { name: /Save/ })
    .click();
  await putConfig;
}

/**
 * Port of the spec-local openSidebarCacheStrategyForm: open the settings
 * sidebar for a question or dashboard, wait for the per-item cache config GET,
 * open the strategy sidesheet via "When to get new results", and return it.
 */
export async function openSidebarCacheStrategyForm(
  page: Page,
  type: "question" | "dashboard",
): Promise<Locator> {
  const getConfig = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/cache" &&
      url.searchParams.has("model") &&
      url.searchParams.has("id")
    );
  });
  if (type === "dashboard") {
    await openDashboardSettingsSidebar(page);
  } else {
    await openQuestionActions(page, "Edit settings");
  }
  await getConfig;
  await page
    .getByLabel("When to get new results", { exact: true })
    .click();
  return cacheStrategySidesheet(page);
}

/**
 * Port of the spec-local cancelConfirmationModal. The confirm-modal test id is
 * on the Mantine Modal root (which reads hidden to toBeVisible), so we assert
 * the inner Cancel button instead of the root (PORTING: Modal-root toBeVisible).
 */
export async function cancelConfirmationModal(page: Page) {
  const cancel = page
    .getByTestId("confirm-modal")
    .getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeVisible();
  await cancel.click();
}

/** Port of the spec-local preemptiveCachingSwitch. */
export function preemptiveCachingSwitch(scope: Scope): Locator {
  return scope.getByTestId("preemptive-caching-switch");
}

/**
 * The role="switch" input inside the preemptive-caching switch. Toggled by
 * force-clicking the input, not the label (PORTING rule 4).
 */
export function preemptiveCachingSwitchInput(scope: Scope): Locator {
  return preemptiveCachingSwitch(scope).getByRole("switch");
}
