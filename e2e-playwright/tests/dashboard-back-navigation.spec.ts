/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/dashboard-back-navigation.cy.spec.js
 *
 * (The `dashboard/` directory holds exactly one file with this basename — the
 * `.js` one — so there is no `.js`/`.ts` sibling pair to split, unlike
 * native-reproductions / permissions-reproductions / visualizations-charts.)
 *
 * Port notes
 * ==========
 *
 * Intercept aliases. The spec leans on all three `cy.intercept` behaviours,
 * so they are ported by `InterceptAlias` (support/dashboard-back-navigation.ts)
 * rather than by `page.waitForResponse`:
 *   - `cy.wait("@alias")` pops PAST responses, and several of this spec's waits
 *     are satisfied retroactively (e.g. `cy.wait("@dashboard")` right after
 *     `visitDashboard`, whose own dashcard-query waits necessarily resolve
 *     *after* the dashboard GET). A literal `waitForResponse` would deadlock.
 *   - `cy.get("@alias.all").should("have.length", n)` counts INTERCEPTIONS,
 *     i.e. requests. This is load-bearing in "should restore a dashboard with
 *     loading cards": both dashcard queries there run `pg_sleep(60)` and
 *     neither has responded when `have.length 2` runs, so a response-counter
 *     could never reach 2.
 *   - Cypress globs don't cross `/`, so `GET /api/dashboard/*` deliberately
 *     does NOT match `/api/dashboard/:id/query_metadata`.
 *
 * URL assertions (STRENGTHENING — called out per the faithfulness rule).
 * Upstream asserts only rendered content after each back-navigation, which a
 * dashboard can satisfy while the history stack is wrong. Since the subject of
 * this spec *is* where you end up, each back-navigation additionally asserts
 * `expect(page).toHaveURL(...)`. These are additions, never replacements — every
 * upstream content assertion is still present. They are deliberately loose
 * (pathname regex) so they can't go red on an id/param difference.
 *
 * Back navigation is by CLICK throughout. Upstream never calls `cy.go("back")`;
 * every back step clicks the app's own "Back to <dashboard>" affordance, so no
 * `page.goBack()` appears here — the two exercise different code.
 *
 * `findByText(x)` with no trailing assertion carries testing-library's implicit
 * existence check; ported as `toBeVisible()`. That is marginally stronger than
 * "exists" (the two differ only for a rendered-but-hidden node); noted once
 * here rather than at each site.
 *
 * Absence assertions are anchored on a signal that only exists in the LOADED
 * state before being taken (PORTING.md #73), never on a bare post-click count.
 *
 * `H.setActionsEnabledForDB` / `H.createAction` are reused read-only from
 * support/command-palette.ts and support/actions-on-dashboards.ts. Importing
 * the latter does NOT pull in a QA-DB dependency: its knex clients are lazily
 * required, and `createAction`/`getActionCardDetails` are plain API/factory
 * helpers.
 *
 * Infra tier. The first describe runs on the bare `default` snapshot. The
 * second describe is tagged `@external` upstream and the tag is HONEST here:
 * it restores `postgres-12` and its only card runs `pg_sleep` against database
 * 2 — the read-only QA Postgres12 sample under that snapshot (so, per the
 * PORTING #85 red-herring rule, it cannot contaminate the shared writable
 * container). It is gated on `PW_QA_DB_ENABLED`; see
 * findings-inbox/dashboard-back-navigation.md for the gate-OFF control.
 *
 * MEASURED, and worth knowing before anyone "optimises" this gate: the
 * @external tier is honest for only ONE of the two tests. Repointing the slow
 * card from database 2 to the H2 sample (database 1, where `pg_sleep` does not
 * exist) kills "should restore a dashboard with loading cards" at its
 * loading-indicator assertion, but "should preserve filter value ..." still
 * PASSES — its subject is request counts and filter-value preservation, which
 * are indifferent to whether the query returns rows or errors. The mutation
 * demonstrably applied (its sibling died from the same constant), so this is
 * over-broad gating rather than a vacuous test: that test's own assertions are
 * load-bearing (a goBack() mutant pushes its final count 2 -> 3). Both stay
 * gated, matching upstream's describe-level tag.
 */
import { setActionsEnabledForDB } from "../support/command-palette";
import {
  dashboardHeader,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import {
  QA_DB_SKIP_REASON,
  cardAlias,
  cardQueryAlias,
  createDashboardWithCards,
  createDashboardWithNativeCard,
  createDashboardWithPermissionError,
  createDashboardWithSlowCard,
  dashboardAlias,
  dashcardQueryAlias,
  datasetAlias,
  updateCardAlias,
} from "../support/dashboard-back-navigation";
import { getDashboardCardMenu } from "../support/dashboard-cards";
import { getDashboardCards } from "../support/dashboard-core";
import { visitDashboardAndCreateTab } from "../support/dashboard-tabs";
import { expect, test } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { summarize } from "../support/models";
import { nativeEditor } from "../support/native-editor";
import { openNotebook, visualize } from "../support/notebook";
import { rightSidebar } from "../support/question-saved";
import { openQuestionsSidebar } from "../support/revisions";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import {
  appBar,
  collectionTable,
  modal,
  popover,
  queryBuilderHeader,
  visitDashboard,
} from "../support/ui";

const { ORDERS_ID } = SAMPLE_DATABASE;
const PERMISSION_ERROR = "Sorry, you don't have permission to see this card.";
const MAX_CARDS = 5;
const MAX_XRAY_WAIT_TIMEOUT = 15000;

test.describe("scenarios > dashboard > dashboard back navigation", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);
  });

  test("should display a back to the dashboard button when navigating to a question", async ({
    page,
    mb,
  }) => {
    const dashboardName = "Orders in a dashboard";
    const backButtonLabel = `Back to ${dashboardName}`;
    const backButton = page.getByLabel(backButtonLabel, { exact: true });

    const dashboard = dashboardAlias(page);
    const cardQuery = cardQueryAlias(page);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await dashboard.wait();

    await page
      .getByTestId("dashcard")
      .getByText("Orders", { exact: true })
      .click();
    await cardQuery.wait();

    await expect(page).toHaveURL(/\/question\//);
    await expect(backButton).toBeVisible();

    await openNotebook(page);
    await summarize(page, { mode: "notebook" });
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await expect(backButton).toBeVisible();
    await visualize(page);

    await backButton.click();
    await modal(page)
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await expect(
      dashboardHeader(page).getByText(dashboardName, { exact: true }),
    ).toBeVisible();
    // STRENGTHENING: the history stack, not just the render.
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}\\b`),
    );

    await getDashboardCard(page).hover();
    await (await getDashboardCardMenu(page)).click();
    await popover(page).getByText("Edit question", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Visualize", exact: true }),
    ).toBeVisible();

    await backButton.click();
    await expect(
      dashboardHeader(page).getByText(dashboardName, { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}\\b`),
    );

    await appBar(page).getByText("Our analytics", { exact: true }).click();
    await collectionTable(page).getByText("Orders", { exact: true }).click();
    // Anchor the absence check on the LOADED question (PORTING.md #73): the
    // question page must have finished its card query before "no back button"
    // means anything.
    await cardQuery.wait();
    await expect(page).toHaveURL(/\/question\//);
    await expect(backButton).toHaveCount(0);
  });

  test("should expand the native editor when editing a question from a dashboard", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboardWithNativeCard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await getDashboardCard(page).hover();
    await (await getDashboardCardMenu(page)).click();
    await popover(page).getByText("Edit question", { exact: true }).click();
    await expect(nativeEditor(page)).toBeVisible();

    await queryBuilderHeader(page)
      .getByLabel("Back to Test Dashboard", { exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboardId}\\b`));

    await getDashboardCard(page)
      .getByText("Orders SQL", { exact: true })
      .click();
    await expect(
      page
        .getByTestId("native-query-top-bar")
        .getByText("This question is written in SQL.", { exact: true }),
    ).toBeVisible();
    // Anchored by the assertion above, which only renders on the loaded
    // question page.
    await expect(nativeEditor(page)).toHaveCount(0);
  });

  test("should display a back to the dashboard button in table x-ray dashboards", async ({
    page,
  }) => {
    const cardTitle = "Total transactions";
    const dataset = datasetAlias(page);

    await page.goto(`/auto/dashboard/table/${ORDERS_ID}?#show=${MAX_CARDS}`);
    await dataset.wait(MAX_XRAY_WAIT_TIMEOUT);

    const matchingCards = () =>
      getDashboardCards(page).filter({ hasText: cardTitle });

    await matchingCards().getByText(cardTitle, { exact: true }).click();
    await dataset.wait();

    await queryBuilderHeader(page)
      .getByLabel(/Back to .*Orders.*/)
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/auto/dashboard/table/${ORDERS_ID}\\b`),
    );
    await expect(matchingCards().first()).toBeAttached();
  });

  test("should display a back to the dashboard button in model x-ray dashboards", async ({
    page,
    mb,
  }) => {
    const cardTitle = "Orders by Subtotal";
    const dataset = datasetAlias(page);

    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    await page.goto(
      `/auto/dashboard/model/${ORDERS_QUESTION_ID}?#show=${MAX_CARDS}`,
    );
    await dataset.wait(MAX_XRAY_WAIT_TIMEOUT);

    const matchingCards = () =>
      getDashboardCards(page).filter({ hasText: cardTitle });

    await matchingCards().getByText(cardTitle, { exact: true }).click();
    await dataset.wait();

    await queryBuilderHeader(page)
      .getByLabel(/Back to .*Orders.*/)
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/auto/dashboard/model/${ORDERS_QUESTION_ID}\\b`),
    );
    await expect(matchingCards().first()).toBeAttached();
  });

  test("should preserve query results when navigating between the dashboard and the query builder", async ({
    page,
    mb,
  }) => {
    const dashboard = dashboardAlias(page);
    const dashcardQuery = dashcardQueryAlias(page);
    const cardQuery = cardQueryAlias(page);

    const dashboardId = await createDashboardWithCards(mb.api);
    await visitDashboard(page, mb.api, dashboardId);
    await dashboard.wait();
    await dashcardQuery.wait();

    const dashcard = getDashboardCard(page);
    await expect(dashcard.getByText("110.93", { exact: true })).toBeVisible();
    await dashcard.getByText("Orders", { exact: true }).click();
    await cardQuery.wait();

    await queryBuilderHeader(page)
      .getByLabel("Back to Test Dashboard", { exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboardId}\\b`));

    // cached data
    await expect(
      getDashboardCard(page, 0).getByText("110.93", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 1).getByText("Text card", { exact: true }),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, 2).getByText("Action card", { exact: true }),
    ).toBeVisible();

    await expect.poll(() => dashboard.requestCount).toBe(1);
    await expect.poll(() => dashcardQuery.requestCount).toBe(1);

    await appBar(page).getByText("Our analytics", { exact: true }).click();

    await collectionTable(page)
      .getByText("Test Dashboard", { exact: true })
      .click();
    await dashboard.wait();
    await dashcardQuery.wait();
    await expect.poll(() => dashcardQuery.requestCount).toBe(2);
  });

  test("should not preserve query results when the question changes during navigation", async ({
    page,
    mb,
  }) => {
    const dashboard = dashboardAlias(page);
    const dashcardQuery = dashcardQueryAlias(page);
    const cardQuery = cardQueryAlias(page);
    const updateCard = updateCardAlias(page);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await dashboard.wait();
    await dashcardQuery.wait();

    const dashcard = getDashboardCard(page);
    await expect(dashcard.getByText("134.91", { exact: true })).toBeVisible();
    await dashcard.getByText("Orders", { exact: true }).click();
    await cardQuery.wait();

    // cy.findByDisplayValue("Orders").clear().type("Orders question").blur()
    // EditableText is a <textarea>: fill() doesn't mark it dirty, so this is
    // the click + select-all + type + blur shape (PORTING.md wave 5). Scoped
    // to the QB header rather than page-wide (the page-wide display-value scan
    // is a documented stale-index flake).
    const header = queryBuilderHeader(page);
    const title = await findByDisplayValue(header, "Orders");
    await title.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Orders question");
    await page.locator("textarea:focus").blur();
    await updateCard.wait();

    await header.getByRole("button", { name: /Summarize/ }).click();

    await rightSidebar(page).getByText("Total", { exact: true }).click();

    await header.getByText("Save", { exact: true }).click();

    await page
      .getByTestId("save-question-modal")
      .getByText("Save", { exact: true })
      .click();
    await updateCard.wait();

    await header
      .getByLabel("Back to Orders in a dashboard", { exact: true })
      .click();
    await dashcardQuery.wait();
    await expect.poll(() => dashboard.requestCount).toBe(1);
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}\\b`),
    );

    const updated = getDashboardCard(page);
    await expect(
      updated.getByText("Orders question", { exact: true }),
    ).toBeVisible();
    // aggregated data
    await expect(updated.getByText("Count", { exact: true })).toBeVisible();
  });

  test("should navigate back to a dashboard with permission errors", async ({
    page,
    mb,
  }) => {
    const dashboard = dashboardAlias(page);
    const dashcardQuery = dashcardQueryAlias(page);
    const card = cardAlias(page);

    const dashboardId = await createDashboardWithPermissionError(mb.api);
    await mb.signInAsNormalUser();
    await visitDashboard(page, mb.api, dashboardId);
    await dashboard.wait();
    await dashcardQuery.wait();

    await expect(
      getDashboardCard(page, 1).getByText(PERMISSION_ERROR, { exact: true }),
    ).toBeVisible();
    await getDashboardCard(page, 0)
      .getByText("Orders 1", { exact: true })
      .click();
    await card.wait();

    await queryBuilderHeader(page)
      .getByLabel("Back to Orders in a dashboard", { exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboardId}\\b`));

    await expect(
      getDashboardCard(page, 1).getByText(PERMISSION_ERROR, { exact: true }),
    ).toBeVisible();
    await expect.poll(() => dashboard.requestCount).toBe(1);
    await expect.poll(() => dashcardQuery.requestCount).toBe(1);
  });

  test("should return to dashboard with specific tab selected", async ({
    page,
    mb,
  }) => {
    const card = cardAlias(page);

    await visitDashboardAndCreateTab(page, mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      save: false,
    });

    // Add card to second tab.
    // Upstream's `cy.icon("pencil").click()` is a page-wide first-match click
    // while the dashboard is ALREADY in edit mode (save: false above), so it
    // is not what enters edit mode. Ported literally with .first() (Cypress
    // first-match semantics).
    await page.locator(".Icon-pencil").first().click();
    await openQuestionsSidebar(page);
    await sidebar(page).getByText("Orders, Count", { exact: true }).click();
    // Anchor the save on the change it saves (PORTING.md): adding a dashcard
    // via the questions sidebar is async, and Playwright fires the save
    // back-to-back with the click, so an unanchored save can exit edit mode
    // without ever firing the PUT.
    await expect(getDashboardCards(page)).toHaveCount(1);
    await saveDashboard(page);

    await getDashboardCard(page)
      .getByText("Orders, Count", { exact: true })
      .click();
    await card.wait();

    await queryBuilderHeader(page)
      .getByLabel("Back to Orders in a dashboard", { exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}\\b`),
    );

    await expect(page.getByRole("tab", { selected: true })).toHaveText("Tab 2");
  });
});

test.describe("scenarios > dashboard > dashboard back navigation", () => {
  // Upstream tags: ["@external", "@actions"]. The @external half is honest —
  // the describe restores the postgres-12 snapshot and its only card runs
  // pg_sleep against the QA Postgres12 container.
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should preserve filter value when navigating between the dashboard and the question without re-fetch", async ({
    page,
    mb,
  }) => {
    const dashboard = dashboardAlias(page);
    const dashcardQuery = dashcardQueryAlias(page);
    const card = cardAlias(page);

    // could be a regular dashboard with card and filters
    const dashboardId = await createDashboardWithSlowCard(mb.api);

    await page.goto(`/dashboard/${dashboardId}`);
    await dashboard.wait();
    await dashcardQuery.wait();

    // initial loading of the dashboard with card
    await expect.poll(() => dashcardQuery.requestCount).toBe(1);

    // Resolve the input ONCE and act on the handle: re-resolving a
    // placeholder-based locator after typing is the documented run-1 trap.
    const sleepInput = filterWidget(page).getByPlaceholder("sleep", {
      exact: true,
    });
    await sleepInput.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("1");
    await page.keyboard.press("Enter");

    await dashcardQuery.wait();

    // we applied filter, so the data is requested again
    await expect.poll(() => dashcardQuery.requestCount).toBe(2);

    // drill down to the question
    await getDashboardCard(page)
      .getByText("Sleep card", { exact: true })
      .click();

    await expect(
      filterWidget(page).getByPlaceholder("sleep", { exact: true }),
    ).toHaveValue("1");
    // if we do not wait for this query, it's canceled and re-triggered on dashboard
    await card.wait();

    // navigate back to the dashboard
    await queryBuilderHeader(page)
      .getByLabel("Back to Sleep dashboard", { exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboardId}\\b`));

    await expect(
      getDashboardCard(page).getByText("Sleep card", { exact: true }),
    ).toBeVisible();

    await expect(
      filterWidget(page).getByPlaceholder("sleep", { exact: true }),
    ).toHaveValue("1");

    // cached data is used, no re-fetching should happen
    await expect.poll(() => dashcardQuery.requestCount).toBe(2);
  });

  // be careful writing a test after this one. tests order matters.
  // the request with a slow response is not cancelled after the test finishes
  // so it will affect interception of @dashcardQuery and mess up the number of
  // requests
  test("should restore a dashboard with loading cards and re-fetch query data", async ({
    page,
    mb,
  }) => {
    const dashboard = dashboardAlias(page);
    const dashcardQuery = dashcardQueryAlias(page);
    const card = cardAlias(page);

    const dashboardId = await createDashboardWithSlowCard(mb.api);
    await page.goto(`/dashboard/${dashboardId}?sleep=60`);
    await dashboard.wait();

    const dashcard = getDashboardCard(page);
    await expect(dashcard.getByTestId("loading-indicator")).toBeVisible();
    await dashcard.getByText("Sleep card", { exact: true }).click();
    await card.wait();

    await queryBuilderHeader(page)
      .getByLabel("Back to Sleep dashboard", { exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/${dashboardId}\\b`));

    await expect(
      getDashboardCard(page).getByText("Sleep card", { exact: true }),
    ).toBeVisible();

    // dashboard is taken from the cache, no re-fetch
    await expect.poll(() => dashboard.requestCount).toBe(1);
    // the query is triggered second time as first one never loaded - no value
    // in the cache
    await expect.poll(() => dashcardQuery.requestCount).toBe(2);
  });
});
