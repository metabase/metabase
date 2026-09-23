/**
 * Helpers for the metric-page spec port
 * (e2e/test/scenarios/metrics/metric-page.cy.spec.ts).
 *
 * Per PORTING rule 9 the shared support/*.ts modules are imported read-only and
 * never edited. Reused rather than reinvented:
 *
 * - `MetricPage` (header / moreMenu / aboutPage) from support/metrics.ts, plus
 *   its `visitMetric` and `undoToast`
 * - `MetricEditor` (queryEditor / saveButton / cancelButton) and `aboutTab`
 *   from support/metrics-editing.ts
 * - `MetricDetail` (definitionTab / dependenciesTab /
 *   aboutPageDescriptionSidebar / exploreLink), `waitForUpdateCard`,
 *   `waitForCreateCard` and `renameMetricTitle` from support/data-studio-metrics.ts
 * - `DependencyGraph` / `waitForBackfillComplete` from support/dependency-graph.ts
 * - `createLibraryWithItems` from support/data-studio-library.ts
 * - `addNotificationHandlerChannel` / `WEBHOOK_TEST_HOST` /
 *   `WEBHOOK_TEST_SESSION_ID` from support/question-saved.ts
 * - `notificationList` from support/onboarding-extras.ts
 * - `installSnowplowCapture` / `expectUnstructuredSnowplowEvent` /
 *   `expectNoBadSnowplowEvents` from support/search-snowplow.ts
 *
 * What is new here: the three MetricPage locators nothing else ports
 * (`overviewPage`, `overviewTab`, `historyTab`), the port of
 * `H.setupNotificationChannel`, and the EditableText description edit. The
 * long comment at the bottom records the snowplow-vantage measurement.
 *
 * Fold into support/metrics.ts at consolidation — together with
 * metrics-editing.ts's `MetricEditor` and data-studio-metrics.ts's
 * `MetricDetail`, this is the last quarter of the single Cypress `MetricPage`
 * object (e2e/support/helpers/e2e-metric-page-helpers.ts), currently split
 * across FOUR port modules.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { MetricPage } from "./metrics";
import { WEBHOOK_TEST_HOST, WEBHOOK_TEST_SESSION_ID } from "./question-saved";

/**
 * The remaining MetricPage locators (e2e-metric-page-helpers.ts). Header tabs
 * are `header().findByText(name)` — testing-library string matching is exact
 * (PORTING rule 1).
 */
export const MetricPageExtras = {
  /** MetricPage.overviewPage. */
  overviewPage: (page: Page): Locator =>
    page.getByTestId("metric-overview-page"),
  /** MetricPage.overviewTab. */
  overviewTab: (page: Page): Locator =>
    MetricPage.header(page).getByText("Overview", { exact: true }),
  /** MetricPage.historyTab. */
  historyTab: (page: Page): Locator =>
    MetricPage.header(page).getByText("History", { exact: true }),
};

/**
 * Port of H.setupNotificationChannel (e2e-notification-helpers.ts): register an
 * HTTP channel pointed at the webhook-tester container.
 */
export async function setupNotificationChannel(
  api: MetabaseApi,
  opts: { name: string; description?: string },
) {
  await api.post("/api/channel", {
    type: "channel/http",
    details: {
      url: `${WEBHOOK_TEST_HOST}/${WEBHOOK_TEST_SESSION_ID}`,
      "fe-form-type": "none",
      "auth-method": "none",
      "auth-info": {},
    },
    ...opts,
  });
}

/**
 * Port of the description-sidebar edit:
 *
 *   sidebar.within(() => cy.findByText(old).click());
 *   cy.focused().clear().type(next).blur();
 *
 * `DescriptionSection` renders an `EditableText`, which only commits on blur and
 * only marks itself dirty on real keystrokes (PORTING wave-5 gotcha) — `fill()`
 * would blur with the model unchanged and never fire the PUT. So: click the
 * rendered markdown to swap in the textarea, assert it actually took focus
 * before typing (PORTING rule 5 — `page.keyboard.*` types at
 * `document.activeElement` with no retry), select-all, type, blur.
 *
 * The caller registers the PUT wait; this only drives the input.
 */
export async function editMetricDescription(
  page: Page,
  sidebar: Locator,
  currentText: string,
  nextText: string,
) {
  await sidebar.getByText(currentText, { exact: true }).click();
  const input = sidebar.getByRole("textbox");
  await expect(input).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(nextText, { delay: 10 });
  await input.blur();
}

/**
 * ── Snowplow vantage: the BROWSER BOUNDARY, decided on a measurement that
 *    contradicted my first choice ────────────────────────────────────────────
 *
 * `metric_page_show_more_clicked` is FRONTEND-emitted
 * (frontend/src/metabase/metrics/analytics.ts -> `trackSimpleEvent`), so in
 * principle either seam could observe it, and I initially chose the per-slot
 * collector (`mb.snowplow`): it is the only seam that can reproduce
 * `H.expectNoBadSnowplowEvents` as REAL Iglu validation rather than the
 * structural stand-in, which would have kept both of this spec's snowplow
 * assertions at full strength.
 *
 * That choice was WRONG, and the measurement is worth recording because
 * support/snowplow-collector.ts documents the opposite:
 *
 *   > The browser tracker may also reach this collector cross-origin [...]
 *   > which preflights. Answering permissively costs nothing and keeps those
 *   > events observable instead of silently dropped by CORS.
 *
 * Measured on slot 4104: it does NOT keep them observable. The tracker POSTs
 * with `credentials: "include"`, and the collector's preflight reply sets
 * `Access-Control-Allow-Origin` (echoing the origin) but NOT
 * `Access-Control-Allow-Credentials: true`. The browser therefore rejects the
 * response and the real POST never leaves:
 *
 *   collector.requests -> ["OPTIONS /com.snowplowanalytics.snowplow/tp2"]
 *   collector.events   -> []
 *   page network       -> POST .../tp2 then FAILED ... net::ERR_FAILED
 *
 * Isolated with a three-way fetch from the page to the collector:
 *   credentials "omit"        -> OK 200
 *   credentials "same-origin" -> OK 200
 *   credentials "include"     -> TypeError: Failed to fetch
 *
 * So the collector is structurally blind to FRONTEND-emitted events, exactly
 * as it is (by design, and correctly documented) the ONLY seam for
 * backend-emitted ones. Fixing it is a one-line change to the shared module,
 * which this port must not make — reported instead.
 *
 * Consequence for this spec: the event assertion runs through
 * `installSnowplowCapture` (support/search-snowplow.ts), and
 * `H.expectNoBadSnowplowEvents` degrades to that module's structural check.
 * `SnowplowCapture` discards the Iglu schema URI (`events.push(outer.data.data)`),
 * so re-validating its events locally is not possible without editing it
 * either. The degradation is stated in the spec header rather than papered over.
 */
