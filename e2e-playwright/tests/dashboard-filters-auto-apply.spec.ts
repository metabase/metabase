/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-auto-apply.cy.spec.js
 *
 * Auto-apply-filters: when the toggle is OFF, changing a dashboard filter opens
 * an "Apply"/"Cancel" toast and the dashcards do NOT re-query until Apply is
 * clicked; when ON, filter changes re-query immediately.
 *
 * Porting notes:
 * - Snowplow helpers are no-op stubs (no snowplow-micro container in the spike
 *   harness; port rule 6). The two snowplow tests keep their real UI actions;
 *   only the reset/enable/expect/assertNo event assertions are neutered.
 * - The `cy.intercept(...).as("@cardQuery")` waits become waitForCardQuery /
 *   waitForPublicCardQuery / waitForEmbedCardQuery, registered BEFORE the
 *   triggering action (rule 2). Where upstream had no explicit `cy.wait` but
 *   read `@cardQuery.all` length, a countRequests counter is polled instead —
 *   the row-count assertion that precedes it already waits for the re-query.
 * - The `updateDashboardSpy` call-count comes from a countRequests counter on
 *   PUT /api/dashboard/:id. Note the port's create* helpers issue their PUTs via
 *   the API request context (mb.api), not the browser page, so — like the
 *   Cypress spy, which does not count cy.request — only the UI toggles are
 *   counted (3 and 1 respectively).
 * - `cy.wait("@updateDashboard")` after a toggle → waitForDashboardPut,
 *   registered before the toggle click.
 * - `H.assertTableRowsCount(n)` (page-level, single-dashcard dashboard) and the
 *   `getDashboardCard().within(() => assertTableRowsCount(n))` cases both map to
 *   assertCardRowsCount(card, n) (support/dashboard-filters-auto-apply.ts), which
 *   accepts a page card, a public/embedded card, or a frame card.
 * - The full-app-embedding test drives the app through the iframe FrameLocator
 *   from visitFullAppEmbeddingUrl; all app locators are scoped to the frame.
 * - `cy.clock()`/`cy.tick(TOAST_TIMEOUT)` → page.clock.install()/runFor.
 */
import { expect, test } from "../support/fixtures";
import { SAMPLE_DATABASE } from "../support/sample-data";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import type { MetabaseApi } from "../support/api";

import { createQuestionAndDashboard } from "../support/factories";
import { editDashboardCard } from "../support/filters-repros";
import { popover, visitDashboard } from "../support/ui";
import {
  dashboardHeader,
  editBar,
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  setFilter,
  sidebar,
} from "../support/dashboard";
import {
  closeDashboardSettingsSidebar,
  openDashboardSettingsSidebar,
} from "../support/dashboard-repros";
import { sidesheet } from "../support/revisions";
import {
  clearFilterWidget,
  countRequests,
  dashboardParametersContainer,
  expectFilterSelected,
  isDashcardQueryRequest,
  waitForDashboardPut,
} from "../support/dashboard-parameters";
import { undoToast } from "../support/metrics";
import {
  visitEmbeddedPage,
  visitPublicDashboard,
} from "../support/question-saved";
import { visitEmbeddedDashboard } from "../support/filters-repros";
import { visitFullAppEmbeddingUrl } from "../support/search";
import { expectInputWithValue } from "../support/interactive-embedding";
import {
  applyFilterButton,
  applyFilterToast,
  assertCardRowsCount,
  cancelFilterButton,
  waitForCardQuery,
  waitForEmbedCardQuery,
  waitForPublicCardQuery,
} from "../support/dashboard-filters-auto-apply";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const FILTER = {
  name: "Category",
  slug: "category",
  id: "2a12e66c",
  type: "string/=",
  sectionId: "string",
};

const FILTER_WITH_DEFAULT_VALUE = {
  default: ["Gadget"],
  name: "Category with default value",
  slug: "category_with_default_value",
  id: "e2809ab2",
  type: "string/=",
  sectionId: "string",
};

const QUESTION_DETAILS = {
  name: "Products table",
  query: { "source-table": PRODUCTS_ID },
};

const TOAST_TIMEOUT = 16000;

const filterToggleLabel = "Auto-apply filters";

type Mb = {
  api: MetabaseApi;
  baseUrl: string;
  signOut(): Promise<void>;
};

// === spec-local helpers (ports of the file's top-level const functions) ===

function getParameterMapping(
  card: { card_id: number },
  parameters: { id: string }[],
) {
  return {
    parameter_mappings: parameters.map((parameter) => ({
      card_id: card.card_id,
      parameter_id: parameter.id,
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    })),
  };
}

async function createDashboard(
  mb: Mb,
  {
    dashboardDetails = {},
    parameter = FILTER,
  }: {
    dashboardDetails?: Record<string, unknown>;
    parameter?: typeof FILTER;
  } = {},
): Promise<number> {
  const parameters = [parameter];
  const card = await createQuestionAndDashboard(mb.api, {
    questionDetails: QUESTION_DETAILS,
    dashboardDetails: { parameters, ...dashboardDetails },
  });
  await editDashboardCard(mb.api, card, getParameterMapping(card, parameters));
  return card.dashboard_id;
}

async function openDashboard(page: Page, mb: Mb, dashboardId: number) {
  // cy.intercept("@cardQuery") + H.visitDashboard: the initial dashcard query
  // is awaited inside visitDashboard, so the first `cy.wait("@cardQuery")` is a
  // no-op here.
  await visitDashboard(page, mb.api, dashboardId);
}

async function disableAutoApply(page: Page) {
  const put = waitForDashboardPut(page);
  // Mantine Switch: click the role="switch" input, not the label (rule 4).
  await sidesheet(page).getByLabel(filterToggleLabel).click({ force: true });
  await put;
  await expect(sidesheet(page).getByLabel(filterToggleLabel)).not.toBeChecked();
}

async function enableAutoApply(page: Page) {
  const put = waitForDashboardPut(page);
  await sidesheet(page).getByLabel(filterToggleLabel).click({ force: true });
  await put;
  await expect(sidesheet(page).getByLabel(filterToggleLabel)).toBeChecked();
}

test.describe("scenarios > dashboards > filters > auto apply", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test.describe("modifying only dashboard", () => {
    test("should handle toggling auto applying filters on and off", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createDashboard(mb);

      const cardQueries = countRequests(page, isDashcardQueryRequest);
      const updateDashboards = countRequests(
        page,
        (method, pathname) =>
          method === "PUT" && /^\/api\/dashboard\/\d+$/.test(pathname),
      );

      await openDashboard(page, mb, dashboardId); // @cardQuery #1

      // changing parameter values by default should reload affected questions
      await filterWidget(page).getByText(FILTER.name, { exact: true }).click();
      {
        const query = waitForCardQuery(page);
        await popover(page).getByText("Gadget", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();
        await query; // @cardQuery #2
      }
      await assertCardRowsCount(getDashboardCard(page, 0), 53);

      // parameter values should be preserved when disabling auto applying filters
      await openDashboardSettingsSidebar(page);
      await disableAutoApply(page);
      await closeDashboardSettingsSidebar(page);
      await expect(
        filterWidget(page).getByText("Gadget", { exact: true }),
      ).toBeVisible();
      await assertCardRowsCount(getDashboardCard(page, 0), 53);

      // draft parameter values should be applied manually
      await filterWidget(page).getByText("Gadget", { exact: true }).click();
      await popover(page).getByText("Widget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();
      await assertCardRowsCount(getDashboardCard(page, 0), 53);
      await expect(
        applyFilterToast(page).getByText("1 filter changed", { exact: true }),
      ).toBeVisible();
      {
        const query = waitForCardQuery(page);
        await applyFilterButton(page).click();
        await query; // @cardQuery #3
      }
      await assertCardRowsCount(getDashboardCard(page, 0), 107);
      await expect.poll(() => cardQueries.count()).toBe(3);

      // draft parameter values should be applied when enabling auto-applying filters
      await filterWidget(page)
        .getByText("2 selections", { exact: true })
        .click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Update filter", exact: true })
        .click();
      await expect(
        filterWidget(page).getByText("Widget", { exact: true }),
      ).toBeVisible();
      await expect(applyFilterButton(page)).toBeVisible();

      await openDashboardSettingsSidebar(page);
      await enableAutoApply(page); // enabling applies the draft → @cardQuery #4
      await closeDashboardSettingsSidebar(page);

      await expect(
        filterWidget(page).getByText("Widget", { exact: true }),
      ).toBeVisible();
      await assertCardRowsCount(getDashboardCard(page, 0), 54);
      await expect.poll(() => cardQueries.count()).toBe(4);

      // last applied parameter values should be used when disabling auto applying
      // filters, even if previously there were draft parameter values
      await filterWidget(page).getByText("Widget", { exact: true }).click();
      {
        const query = waitForCardQuery(page);
        await popover(page).getByText("Gadget", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Update filter", exact: true })
          .click();
        await query; // auto-apply on → @cardQuery #5
      }

      await openDashboardSettingsSidebar(page);
      await disableAutoApply(page);
      await closeDashboardSettingsSidebar(page);

      await expect(
        filterWidget(page).getByText("2 selections", { exact: true }),
      ).toBeVisible();
      await expect.poll(() => cardQueries.count()).toBe(5);

      await expect.poll(() => updateDashboards.count()).toBe(3);
    });
  });

  test("should not save filter state for dashboard parameter w/o auto-apply enabled", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb, {
      dashboardDetails: { auto_apply_filters: false },
    });
    await openDashboard(page, mb, dashboardId);

    await filterWidget(page).getByText(FILTER.name, { exact: true }).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(applyFilterButton(page)).toBeVisible();
    await expect(
      applyFilterToast(page).getByText("1 filter changed", { exact: true }),
    ).toBeVisible();

    // verify filter value is not saved
    await visitDashboard(page, mb.api, dashboardId);
    await expect(
      filterWidget(page).getByText("Gadget", { exact: true }),
    ).toHaveCount(0);
  });

  test("should allow resetting unapplied filter state", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb, {
      dashboardDetails: { auto_apply_filters: false },
    });
    await openDashboard(page, mb, dashboardId);

    await filterWidget(page).getByText(FILTER.name, { exact: true }).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await expect(applyFilterButton(page)).toBeVisible();
    await expect(
      applyFilterToast(page).getByText("1 filter changed", { exact: true }),
    ).toBeVisible();

    await cancelFilterButton(page).click();
    await expect(applyFilterToast(page)).toHaveCount(0);

    await filterWidget(page).getByText(FILTER.name, { exact: true }).click();
    // findByText("Gadget").should("not.be.checked") targets the option's
    // checkbox — resolved by its label so toBeChecked has a checkable subject.
    await expectFilterSelected(popover(page), "Gadget", false);
  });

  test.describe("modifying dashboard and dashboard cards", () => {
    test("should not preserve draft parameter values when editing the dashboard", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createDashboard(mb, {
        dashboardDetails: { auto_apply_filters: false },
      });
      const updateDashboards = countRequests(
        page,
        (method, pathname) =>
          method === "PUT" && /^\/api\/dashboard\/\d+$/.test(pathname),
      );
      await openDashboard(page, mb, dashboardId);

      await filterWidget(page).getByText(FILTER.name, { exact: true }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await expect(applyFilterButton(page)).toBeVisible();

      await editDashboard(page);

      await setFilter(page, "Text or Category", "Is");

      await sidebar(page).getByLabel("Label").fill("Vendor");
      // Category is already mapped; the new Vendor filter shows the (single)
      // "Select…" placeholder — .first() mirrors Cypress first-match.
      await getDashboardCard(page, 0)
        .getByText("Select…", { exact: true })
        .first()
        .click();
      await popover(page).getByText("Vendor", { exact: true }).click();
      await saveDashboard(page);

      await expect(
        dashboardParametersContainer(page).getByText("Category", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        dashboardParametersContainer(page).getByText("Vendor", { exact: true }),
      ).toBeVisible();
      await expect(
        dashboardParametersContainer(page).getByText("Gadget", { exact: true }),
      ).toHaveCount(0);
      await expect(applyFilterToast(page)).toHaveCount(0);

      await expect.poll(() => updateDashboards.count()).toBe(1);
    });
  });

  test.describe("modify nothing", () => {
    test("should preserve draft parameter values when editing of the dashboard was cancelled", async ({
      page,
      mb,
    }) => {
      const dashboardId = await createDashboard(mb, {
        dashboardDetails: { auto_apply_filters: false },
      });
      await openDashboard(page, mb, dashboardId);

      await filterWidget(page).getByText(FILTER.name, { exact: true }).click();
      await popover(page).getByText("Gadget", { exact: true }).click();
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await expect(applyFilterButton(page)).toBeVisible();

      await editDashboard(page);
      await editBar(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(
        filterWidget(page).getByText("Gadget", { exact: true }),
      ).toBeVisible();
      await expect(applyFilterButton(page)).toBeVisible();
    });
  });

  test.describe("parameter with default values", () => {
    let dashboardId: number;

    test.beforeEach(async ({ mb }) => {
      dashboardId = await createDashboard(mb, {
        parameter: FILTER_WITH_DEFAULT_VALUE,
      });
    });

    test("should handle toggling auto applying filters on and off", async ({
      page,
      mb,
    }) => {
      await openDashboard(page, mb, dashboardId);

      await assertCardRowsCount(getDashboardCard(page, 0), 53);

      // parameter with default value should still be applied after turning
      // auto-apply filter off
      await openDashboardSettingsSidebar(page);
      await expect(
        sidesheet(page).getByLabel(filterToggleLabel),
      ).toBeChecked();
      await disableAutoApply(page);
      await closeDashboardSettingsSidebar(page);

      await assertCardRowsCount(getDashboardCard(page, 0), 53);

      // card result should be updated after manually updating the filter
      await clearFilterWidget(page);
      await applyFilterButton(page).click();

      await assertCardRowsCount(getDashboardCard(page, 0), 200);

      // should not use the default parameter after turning auto-apply filter on
      // again since the parameter was manually updated
      await openDashboardSettingsSidebar(page);
      await expect(
        sidesheet(page).getByLabel(filterToggleLabel),
      ).not.toBeChecked();
      await enableAutoApply(page);

      await assertCardRowsCount(getDashboardCard(page, 0), 200);
    });
  });

  test.describe("no collection curate permission", () => {
    let dashboardId: number;

    test.beforeEach(async ({ mb }) => {
      dashboardId = await createDashboard(mb);
      await mb.signIn("readonly");
    });

    test("should not be able to toggle auto-apply filters toggle", async ({
      page,
      mb,
    }) => {
      await openDashboard(page, mb, dashboardId); // @cardQuery awaited by visit

      // shouldn't even show settings as an option for this user
      await dashboardHeader(page).locator(".Icon-ellipsis").click();
      await expect(
        popover(page).getByText("Edit settings", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test.describe("embeddings", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test.describe("public embeds", () => {
      test("should apply filters after clicking the apply button when auto-apply filters is turned off", async ({
        page,
        mb,
      }) => {
        const dashboardId = await createDashboard(mb, {
          dashboardDetails: { auto_apply_filters: false },
        });
        await visitPublicDashboard(page, mb, dashboardId);

        await expect(applyFilterToast(page)).toHaveCount(0);
        await filterWidget(page)
          .getByText("Category", { exact: true })
          .click();
        await popover(page).getByText("Widget", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();
        await assertCardRowsCount(getDashboardCard(page, 0), 200);
        await expect(applyFilterButton(page)).toBeVisible();
        await applyFilterButton(page).click();
        await assertCardRowsCount(getDashboardCard(page, 0), 54);
      });

      test("should not show toast", async ({ page, mb }) => {
        const dashboardId = await createDashboard(mb);
        await page.clock.install();
        const cardQuery = await openSlowPublicDashboard(page, mb, dashboardId, {
          [FILTER.slug]: "Gadget",
        });
        await expect(
          filterWidget(page).getByText("Gadget", { exact: true }),
        ).toBeVisible();

        await page.clock.runFor(TOAST_TIMEOUT);
        await cardQuery;
        await expect(undoToast(page)).toHaveCount(0);
      });
    });

    test.describe("signed embeds", () => {
      test("should apply filters after clicking the apply button when auto-apply filters is turned off", async ({
        page,
        mb,
      }) => {
        const dashboardId = await createDashboard(mb, {
          dashboardDetails: {
            auto_apply_filters: false,
            enable_embedding: true,
            embedding_params: { [FILTER.slug]: "enabled" },
          },
        });
        await visitEmbeddedPage(page, mb, {
          resource: { dashboard: dashboardId },
          params: {},
        });

        await expect(applyFilterToast(page)).toHaveCount(0);
        await filterWidget(page)
          .getByText("Category", { exact: true })
          .click();
        await popover(page).getByText("Widget", { exact: true }).click();
        await popover(page)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();
        await assertCardRowsCount(getDashboardCard(page, 0), 200);
        await expect(applyFilterButton(page)).toBeVisible();
        await applyFilterButton(page).click();
        await assertCardRowsCount(getDashboardCard(page, 0), 54);
      });

      test("should not show toast", async ({ page, mb }) => {
        const dashboardId = await createDashboard(mb, {
          dashboardDetails: {
            enable_embedding: true,
            embedding_params: { [FILTER.slug]: "enabled" },
          },
        });

        await page.clock.install();
        const cardQuery = await openSlowEmbeddingDashboard(
          page,
          mb,
          dashboardId,
          { [FILTER.slug]: "Gadget" },
        );
        await expect(
          filterWidget(page).getByText("Gadget", { exact: true }),
        ).toBeVisible();

        await page.clock.runFor(TOAST_TIMEOUT);
        await cardQuery;
        await expect(undoToast(page)).toHaveCount(0);
      });
    });

    test.describe("full-app embeddings", () => {
      test.beforeEach(async ({ mb }) => {
        await mb.signInAsNormalUser();
      });

      test("should apply filters after clicking the apply button when auto-apply filters is turned off", async ({
        page,
        mb,
      }) => {
        const dashboardId = await createDashboard(mb, {
          dashboardDetails: {
            name: "Full-app embedding dashboard",
            auto_apply_filters: false,
          },
        });
        const frame = await visitFullAppEmbeddingUrl(page, {
          url: `/dashboard/${dashboardId}`,
          qs: { side_nav: false, logo: false },
          baseUrl: mb.baseUrl,
        });

        await expectInputWithValue(frame, "Full-app embedding dashboard");
        // `logo` is a full-app embedding parameter — confirm we're in that mode.
        await expect(frame.getByTestId("main-logo")).toHaveCount(0);

        await expect(applyFilterToast(frame)).toHaveCount(0);
        await frame
          .getByTestId("parameter-widget")
          .getByText("Category", { exact: true })
          .click();
        await popover(frame).getByText("Widget", { exact: true }).click();
        await popover(frame)
          .getByRole("button", { name: "Add filter", exact: true })
          .click();
        await assertCardRowsCount(embeddedDashboardCard(frame, 0), 200);
        await expect(applyFilterButton(frame)).toBeVisible();
        await applyFilterButton(frame).click();
        await assertCardRowsCount(embeddedDashboardCard(frame, 0), 54);
      });
    });
  });
});

// === snowplow describe (separate top-level describe upstream) ===

// TODO: no snowplow-micro container in the spike harness (port rule 6). These
// two tests keep their real UI actions; only the snowplow event assertions
// (reset/enable/expect/assertNo) are neutered.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
) => {};
const assertNoUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
) => {};

test.describe("scenarios > dashboards > filters > auto apply (snowplow)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should send snowplow events when disabling auto-apply filters", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb);
    await openDashboard(page, mb, dashboardId); // @cardQuery awaited by visit

    await openDashboardSettingsSidebar(page);
    await disableAutoApply(page);
    await expectUnstructuredSnowplowEvent({
      event: "auto_apply_filters_disabled",
    });
  });

  test("should not send snowplow events when enabling auto-apply filters", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb, {
      dashboardDetails: { auto_apply_filters: false },
    });
    await openDashboard(page, mb, dashboardId); // @cardQuery awaited by visit

    await openDashboardSettingsSidebar(page);
    await enableAutoApply(page);
    await assertNoUnstructuredSnowplowEvent({
      event: "auto_apply_filters_disabled",
    });
  });
});

// === slow public / embedded dashboard openers (spec-local consts upstream) ===

function embeddedDashboardCard(frame: FrameLocator, index: number): Locator {
  return frame.getByTestId("dashcard-container").nth(index);
}

async function openSlowPublicDashboard(
  page: Page,
  mb: Mb,
  dashboardId: number,
  params: Record<string, string>,
) {
  const cardQuery = waitForPublicCardQuery(page);
  await visitPublicDashboard(page, mb, dashboardId, { params });
  await expect(getDashboardCard(page, 0)).toBeVisible();
  return cardQuery;
}

async function openSlowEmbeddingDashboard(
  page: Page,
  mb: Mb,
  dashboardId: number,
  setFilters: Record<string, string>,
) {
  const cardQuery = waitForEmbedCardQuery(page);
  await visitEmbeddedDashboard(
    page,
    mb,
    { resource: { dashboard: dashboardId }, params: {} },
    { setFilters },
  );
  await expect(getDashboardCard(page, 0)).toBeVisible();
  return cardQuery;
}
