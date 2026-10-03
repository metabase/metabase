/**
 * Playwright port of
 * e2e/test/scenarios/question/question-analytics.cy.spec.js
 *
 * Snowplow is CAPTURED, not stubbed. PORTING rule 6's no-op stub applies only
 * where snowplow is incidental; here the `chart_generated` event IS the
 * subject, so stubbing would port the single test as a no-op.
 * `installSnowplowCapture` (support/search-snowplow.ts) records the tracker's
 * own POST body at the browser boundary — no container, no shared global store,
 * no cross-slot contention. Reused unmodified.
 *
 * Port notes:
 * - `H.resetSnowplow()` → `installSnowplowCapture` (beforeEach) and
 *   `capture.reset()` for the mid-test reset.
 * - `H.enableTracking()` → `updateSetting("anon-tracking-enabled", true)`,
 *   kept for fidelity even though the capture already forces that setting on
 *   client-side (in `window.MetabaseBootstrap` and `/api/session/properties`).
 * - `H.expectNoBadSnowplowEvents()` in `afterEach` is the structural stand-in:
 *   without snowplow-micro we cannot run Iglu schema validation, so it only
 *   asserts every captured payload decoded to a well-formed self-describing
 *   event. Recorded gap, same as the other snowplow ports.
 * - The "should not track again" half is real, not vacuous: the FE gates the
 *   event on the `non-table-chart-generated` **backend** setting, written by
 *   `setDidFirstNonTableChartRender` (query_builder/actions/ui.ts), so the
 *   second render legitimately fires nothing. `assertNoUnstructuredSnowplowEvent`
 *   is `expectUnstructuredSnowplowEvent(..., 0)`, which polls — and it is
 *   anchored by the preceding bar-chart render (the sidebar "Done" click and
 *   the resulting visualization), so it cannot pass on an unrendered page.
 */
import { openOrdersTable } from "../support/ad-hoc-question";
import { expect, test } from "../support/fixtures";
import { summarize } from "../support/nested-questions";
import { rightSidebar } from "../support/question-saved";
import {
  assertNoUnstructuredSnowplowEvent,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";
import type { Page } from "@playwright/test";

async function generateNonTableVisualization(page: Page) {
  await page.goto("/");
  await openOrdersTable(page);
  await summarize(page);

  // Change query to render a bar chart
  const sidebar = rightSidebar(page);
  await sidebar.getByText("Quantity", { exact: true }).click();
  await sidebar.getByRole("button", { name: "Done", exact: true }).click();

  // Not in the Cypress original: the bar chart has actually rendered. This is
  // the anchor for the absence assertion in the second half of the test —
  // without it, "no chart_generated event" would be satisfied by "the chart
  // never rendered". Cypress's H.expectUnstructuredSnowplowEvent polling gave
  // the first half a de-facto settle; the second half never had one.
  const viz = page.getByTestId("query-visualization-root");
  await expect(viz).toBeVisible();
  await expect(viz.locator("svg").first()).toBeVisible();
}

test.describe("scenarios > question > snowplow", () => {
  test.describe("chart_generated", () => {
    let snowplow: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      // H.resetSnowplow(): the capture starts empty and is installed before the
      // first navigation (the tracker is created during app bootstrap).
      snowplow = await installSnowplowCapture(page, mb.baseUrl);
      await mb.signInAsAdmin();
      // H.enableTracking()
      await mb.api.updateSetting("anon-tracking-enabled", true);
    });

    test.afterEach(async () => {
      expectNoBadSnowplowEvents(snowplow);
    });

    test("should track first non-table visualization rendered", async ({
      page,
    }) => {
      await generateNonTableVisualization(page);

      // Ensure chart_generated event is tracked
      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "chart_generated",
        event_detail: "bar",
      });

      // Reset and generate non-table visualization second time
      snowplow.reset();
      await generateNonTableVisualization(page);

      // Should not track chart_generated event again
      await assertNoUnstructuredSnowplowEvent(snowplow, {
        event: "chart_generated",
      });
    });
  });
});
