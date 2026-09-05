/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/dashboard-card-fetching.cy.spec.js
 *
 * The dashcard-query interceptions (`cy.wait(["@dashcardQuery",
 * "@dashcardQuery"])` + reading each request body) become the
 * `collectDashcardQueryBodies` collector, registered BEFORE the dashboard
 * navigation (PORTING rule 2). `visitDashboard` does the goto and already
 * awaits both dashcard-query responses; the collector runs alongside it and
 * hands back the two POST bodies.
 */
import {
  CARDS,
  collectDashcardQueryBodies,
} from "../support/dashboard-card-fetching";
import { updateDashboardCards } from "../support/dashboard-core";
import { createDashboard } from "../support/factories";
import { test, expect } from "../support/fixtures";
import { visitDashboard } from "../support/ui";

test.describe("dashboard card fetching", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should pass same dashboard_load_id to every query to enable metadata cache sharing", async ({
    page,
    mb,
  }) => {
    const dashboard = await createDashboard(mb.api, { name: "test dashboard" });
    await updateDashboardCards(mb.api, {
      dashboard_id: dashboard.id,
      cards: CARDS,
    });

    const bodiesPromise = collectDashcardQueryBodies(page, 2);
    await visitDashboard(page, mb.api, dashboard.id);
    const [query1, query2] = await bodiesPromise;

    expect(String(query1.dashboard_load_id)).toHaveLength(36);
    expect(String(query2.dashboard_load_id)).toHaveLength(36);
    expect(query1.dashboard_load_id).toBe(query2.dashboard_load_id);
  });
});
