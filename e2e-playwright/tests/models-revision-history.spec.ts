/**
 * Playwright port of e2e/test/scenarios/models/models-revision-history.cy.spec.js
 *
 * Porting notes:
 * - `cy.location("pathname").should("match", …)` is retried by Cypress, so it's
 *   ported as `expect.poll` on the pathname (PORTING.md hash/URL gotcha).
 * - openRevisionHistory / revertTo / ORDERS_BY_YEAR_QUESTION_ID live in the new
 *   support/models-revision-history.ts; visitModel (support/models.ts) and
 *   echartsContainer (support/charts.ts) are imported read-only.
 */
import { echartsContainer } from "../support/charts";
import { expect, test } from "../support/fixtures";
import { visitModel } from "../support/models";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  openRevisionHistory,
  revertTo,
} from "../support/models-revision-history";
import { sidesheet } from "../support/revisions";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";

test.describe("scenarios > models > revision history", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
    await mb.api.put(`/api/card/${ORDERS_BY_YEAR_QUESTION_ID}`, {
      name: "Orders Model",
      type: "model",
    });
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should allow reverting to a saved question state and back into a model again", async ({
    page,
    mb,
  }) => {
    await visitModel(page, ORDERS_BY_YEAR_QUESTION_ID);

    await openRevisionHistory(page);
    await revertTo(page, "You created this");

    await expectUnstructuredSnowplowEvent(mb, {
      event: "revert_version_clicked",
      event_detail: "card",
    });

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/question\/\d+/);
    await expect(echartsContainer(page)).toBeVisible();

    await sidesheet(page)
      .getByRole("tab", { name: "History", exact: true })
      .click();
    await revertTo(page, "You edited this");

    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/model\/\d+/);
    await expect(page.getByTestId("cell-data").first()).toBeVisible();
  });
});
