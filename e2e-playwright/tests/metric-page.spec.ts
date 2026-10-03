/**
 * Port of e2e/test/scenarios/metrics/metric-page.cy.spec.ts (413 lines).
 *
 * ── Gate mapping (per-TEST, not per-file, not per-describe) ─────────────────
 * The queue billed this as "external (1/2 describes)". That is the wrong SHAPE:
 * upstream's only tag is `{ tags: ["@external"] }` on a single `it`, not on a
 * describe. The file has 11 tests across two describes and exactly ONE is
 * tagged. A file-wide gate would have skipped 10 green-but-not-executing tests
 * (FINDINGS #121); a describe-wide gate on the outer describe would have
 * skipped 8.
 *   - `should create an alert with webhook…`  → WEBHOOK_TESTER_ENABLED
 *     (webhook-tester container on :9080, via H.setupNotificationChannel)
 *   - `describe("ee features")` (3 tests)     → pro-self-hosted token
 *   - the other 7 tests                       → NO gate. Checked what they
 *     actually restore/touch rather than trusting the absence of a tag
 *     (FINDINGS #123): all seven use only `restore()`'s default snapshot and
 *     the sample database. No writable snapshot, no QA DB, no container.
 *
 * ── Token predicate (traced, not assumed) ───────────────────────────────────
 * `H.activateToken("pro-self-hosted")` on the ee describe. The three tests need
 * three different features and each was traced to its own predicate:
 *   - "Metric usage analytics" → `PLUGIN_AUDIT.InsightsMenuItem`, assigned only
 *     inside `if (hasPremiumFeature("audit_app"))`
 *     (enterprise/frontend/.../audit_app/index.js:50). The OSS default is
 *     `PluginPlaceholder` (frontend/src/metabase/plugins/oss/audit.ts:50) →
 *     renders null. Real gate, no short-circuit.
 *   - "Dependencies" tab + the "Relationships" sidebar section →
 *     `PLUGIN_DEPENDENCIES.isEnabled`, set only inside
 *     `if (hasPremiumFeature("dependencies"))`
 *     (enterprise/frontend/.../dependencies/index.ts:15-16). Consumed by
 *     MetricTabs.tsx:69 and DescriptionSection.tsx:33. Real gate.
 *   - "Open in Data Studio" is NOT feature-gated in the toolbar: it hangs off
 *     the plain `showDataStudioLink` prop, which defaults true and is set false
 *     only by the five `DataStudioMetric*Page` components. What the test needs
 *     the token for is the SETUP — `createLibraryWithItems` POSTs
 *     `/api/ee/library`, and `metabase_enterprise.library.validation` declares
 *     `:feature :library` on its `defenterprise` checks — plus the
 *     `/data-studio/library/metrics/:id` route the second half navigates to.
 * Method: grepped the FE call site for each string, followed the plugin symbol
 * to its `hasPremiumFeature` guard, and confirmed the OSS fallback is a
 * null-rendering `PluginPlaceholder`. Reported in full in the findings file.
 *
 * The `.env` trailing-comma trap is INAPPLICABLE here: `support/env.ts` loads
 * tokens from repo-root `cypress.env.json`, not `.env`. Measured
 * `resolveToken("pro-self-hosted")` → 64 chars, no trailing comma.
 *
 * ── Snowplow vantage: the BROWSER BOUNDARY (not dead setup, and not the
 *    collector — I tried the collector first and MEASURED it blind) ──────────
 * `metric_page_show_more_clicked` is FRONTEND-emitted
 * (frontend/src/metabase/metrics/analytics.ts → `trackSimpleEvent`). The spec
 * has a real event assertion AND a real `afterEach(expectNoBadSnowplowEvents)`,
 * so "none — dead setup" is not the answer here.
 * I chose the per-slot collector first, because it is the only seam that can
 * reproduce `expectNoBadSnowplowEvents` as genuine Iglu validation. It does not
 * work: the tracker POSTs with `credentials: "include"` and the collector's
 * preflight omits `Access-Control-Allow-Credentials`, so the POST dies with
 * net::ERR_FAILED and the collector records only the OPTIONS. Full measurement
 * in support/metric-page.ts. Hence `installSnowplowCapture`, with
 * `expectNoBadSnowplowEvents` DEGRADED to a structural check — stated, not
 * papered over.
 *
 * ── Pinned values flagged for CI drift (jar here is 2026-07-18; CI merges) ───
 * - The four/eight dimension names on the Overview tab ("By Created At", "By
 *   State", "By Category", "By City" then + Name/Source/Title/Vendor) and the
 *   counts 4 and 8. These come from the metric's computed `dimensions`, which
 *   are derived from Orders' (and its FK targets') field metadata and
 *   fingerprints — exactly the sample-data-derived class that differs between a
 *   local jar and a CI merge build. Upstream pins them, so this port does too.
 * - `/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard` — the slug is
 *   snapshot-derived; ORDERS_DASHBOARD_ID is read from the fixture, not
 *   hardcoded.
 * - No metric VALUE is asserted anywhere in this spec (the scalar's number is
 *   never read), so the "displayed value differs on a merge build" hazard the
 *   brief flagged does not bite here.
 *
 * ── Port notes ──────────────────────────────────────────────────────────────
 * - The `POST /api/revision/revert` stub supplies an explicit
 *   `{ message: "Cannot revert: missing metric" }` body UPSTREAM, and the test
 *   asserts that exact string surfaces in the toast. So `route.fulfill` with
 *   that JSON body is faithful — the "cy.intercept 500 sends an EMPTY body"
 *   rule applies to bodyless stubs and is inapplicable here.
 * - `H.undoToast()` is `cy.findByTestId` (singular), so
 *   `should("contain.text", x)` is a single-element containment →
 *   `toContainText`, no set semantics to preserve.
 * - 🔴 UndoListing.tsx:203 reads `"Cypress" in window ? MockGroup :
 *   TransitionGroup` — the product DISABLES the toast exit transition, but only
 *   under Cypress. Playwright gets the real `TransitionGroup`
 *   (`unmountOnExit`, `exit: TOAST_TRANSITION_DURATION`), so a dismissed toast
 *   lingers in the DOM for seconds. Upstream's close-click is therefore
 *   instantaneous and this port's is not: clicking close and moving straight on
 *   left the old toast alive until the NEXT toast arrived, and
 *   `getByTestId("toast-undo")` then strict-mode-failed on 2 elements
 *   (deterministic, 3/3). Measured: still present at the History click, gone
 *   ~4s later. Fixed by gating on the dismissal (`toHaveCount(0)`) — the state
 *   the race corrupts — NOT by loosening the locator to `.first()`, which would
 *   have asserted against whichever toast happened to be on top.
 * - `createLibraryWithItems` returns the metric id directly; upstream re-finds
 *   it with `GET /api/card` + a name/type filter purely because the Cypress
 *   helper only aliased it. Using the returned id is the same metric and
 *   strictly more precise (a name collision cannot mis-target it).
 */
import { expect, test } from "../support/fixtures";

import { createLibraryWithItems } from "../support/data-studio-library";
import {
  DependencyGraph,
  waitForBackfillComplete,
} from "../support/dependency-graph";
import {
  MetricDetail,
  waitForCreateCard,
  waitForUpdateCard,
  renameMetricTitle,
} from "../support/data-studio-metrics";
import { echartsContainer } from "../support/charts";
import { MetricEditor } from "../support/metrics-editing";
import { MetricPage, undoToast, visitMetric } from "../support/metrics";
import {
  MetricPageExtras,
  editMetricDescription,
  setupNotificationChannel,
} from "../support/metric-page";
import { getNotebookStep } from "../support/notebook";
import { notificationList } from "../support/onboarding-extras";
import { addNotificationHandlerChannel } from "../support/question-saved";
import { resolveToken } from "../support/api";
import { expectNoDisplayValue } from "../support/admin-settings";
import { findByDisplayValue } from "../support/filters-repros";
import { ORDERS_DASHBOARD_ID, SAMPLE_DATABASE } from "../support/sample-data";
import {
  type SnowplowCapture,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { main, modal, popover } from "../support/ui";

// Ids read from the fixture at import time — never guessed (PORTING).
const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Orders count",
  description: "Total number of orders",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar" as const,
};

const ORDERS_TIMESERIES_METRIC = {
  name: "Orders over time",
  description: "Count of orders broken down by month",
  type: "metric" as const,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
  display: "line" as const,
};

// Assigned per test in beforeEach; Playwright runs a file's tests serially
// within a worker, so a module-scoped binding is safe (same shape as
// tests/search-snowplow.spec.ts).
let snowplow: SnowplowCapture;

test.describe("scenarios > metrics > metric page", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // H.resetSnowplow(): a fresh capture per test IS the reset. Must be
    // installed before the first navigation — the tracker is built during app
    // bootstrap.
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
    // H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);
  });

  test.afterEach(async () => {
    // H.expectNoBadSnowplowEvents() — DEGRADED. Upstream asks snowplow-micro
    // for Iglu schema-validation failures; at the browser boundary all we can
    // assert is that every payload decoded into a well-formed self-describing
    // event. It does NOT catch "the FE emits a field the schema rejects".
    expectNoBadSnowplowEvents(snowplow);
  });

  test("should display scalar metric, edit name and description, explore link, and more menu actions", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitMetric(page, metric.id);

    // about page with description sidebar
    await expect(MetricPage.aboutPage(page)).toBeVisible();
    const sidebar = MetricDetail.aboutPageDescriptionSidebar(page);
    await expect(
      sidebar.getByText("Total number of orders", { exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Source", { exact: true })).toBeVisible();
    await expect(
      sidebar.getByText("Sample Database", { exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Orders", { exact: true })).toBeVisible();

    // explore link
    await expect(MetricDetail.exploreLink(page)).toHaveAttribute(
      "href",
      /\/explore/,
    );

    // edit description
    const descriptionUpdate = waitForUpdateCard(page);
    await editMetricDescription(
      page,
      sidebar,
      "Total number of orders",
      "Updated description",
    );
    await descriptionUpdate;
    await expect(
      sidebar.getByText("Updated description", { exact: true }),
    ).toBeVisible();

    // edit name inline
    await renameMetricTitle(
      page,
      await findByDisplayValue(MetricPage.aboutPage(page), "Orders count"),
      "Renamed metric",
    );
    await expect(
      await findByDisplayValue(MetricPage.aboutPage(page), "Renamed metric"),
    ).toBeVisible();

    // duplicate via more menu
    await MetricPage.moreMenu(page).click();
    await popover(page).getByText("Duplicate", { exact: true }).click();
    const nameField = modal(page).getByLabel("Name", { exact: true });
    await expect(nameField).toHaveValue("Renamed metric - Duplicate");
    await nameField.clear();
    await nameField.fill("Renamed metric copy");
    // The Duplicate modal goes through POST /api/card (CardCopyModal uses
    // useCreateCardMutation), not /api/card/:id/copy — PORTING batch-12 gotcha.
    const createCard = waitForCreateCard(page);
    await modal(page)
      .getByRole("button", { name: "Duplicate", exact: true })
      .click();
    await createCard;
    await expect(MetricPage.aboutPage(page)).toBeVisible();
  });

  test("should open alert channel setup modal from more menu when no channels configured", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitMetric(page, metric.id);

    await MetricPage.moreMenu(page).click();
    await popover(page).getByText("Create an alert", { exact: true }).click();

    const dialog = modal(page);
    await expect(
      dialog.getByText(
        "To get notified when something happens, or to send this chart on a " +
          "schedule, first set up email, Slack, or a webhook.",
        { exact: true },
      ),
    ).toBeVisible();

    for (const [label, href] of [
      ["Set up email", "/admin/settings/email"],
      ["Set up Slack", "/admin/settings/slack"],
      ["Add a webhook", "/admin/settings/webhooks"],
    ] as const) {
      const text = dialog.getByText(label, { exact: true });
      await expect(text).toBeVisible();
      // `.closest("a")` — the text node's nearest anchor ancestor.
      await expect(
        text.locator("xpath=ancestor-or-self::a[1]"),
      ).toHaveAttribute("href", href);
    }
  });

  // @external upstream: needs the webhook-tester container.
  // docker run -p 9080:8080/tcp tarampampam/webhook-tester:1.1.0 serve \
  //   --create-session 00000000-0000-0000-0000-000000000000
  test("should create an alert with webhook and show Edit alerts after", async ({
    page,
    mb,
  }) => {
    test.skip(
      !process.env.WEBHOOK_TESTER_ENABLED,
      "Requires the webhook-tester container on :9080 (set WEBHOOK_TESTER_ENABLED)",
    );

    await setupNotificationChannel(mb.api, {
      name: "Foo Hook",
      description: "This is a hook",
    });
    await setupNotificationChannel(mb.api, {
      name: "Bar Hook",
      description: "This is another hook",
    });
    await page.context().addCookies([
      {
        name: "metabase.SEEN_ALERT_SPLASH",
        value: "true",
        url: mb.baseUrl,
      },
    ]);

    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitMetric(page, metric.id);

    await MetricPage.moreMenu(page).click();
    await popover(page).getByText("Create an alert", { exact: true }).click();

    await addNotificationHandlerChannel(page, "Bar Hook");

    const createAlert = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/notification",
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();

    const alertResponse = await createAlert;
    const alertBody = (await alertResponse.json()) as {
      payload?: { send_condition?: string };
    };
    expect(alertBody.payload?.send_condition).toBe("has_result");

    // Upstream has a bare `H.notificationList().findByText(...)` with no
    // assertion chained: in Cypress the implicit existence check inside
    // findByText still makes it load-bearing (it fails if absent), so
    // toBeVisible() here is the faithful reading, not a strengthening.
    await expect(
      notificationList(page).getByText("Your alert is all set up.", {
        exact: true,
      }),
    ).toBeVisible();

    await MetricPage.moreMenu(page).click();
    await expect(
      popover(page).getByText("Edit alerts", { exact: true }),
    ).toBeVisible();
  });

  test("should display timeseries metric and navigate between tabs", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_TIMESERIES_METRIC);
    await visitMetric(page, metric.id);

    await expect(MetricPage.aboutPage(page)).toBeVisible();
    await expect(echartsContainer(page)).toBeVisible();

    await expect(MetricEditor.aboutTab(page)).toBeVisible();
    await expect(MetricPageExtras.overviewTab(page)).toBeVisible();
    await expect(MetricDetail.definitionTab(page)).toBeVisible();
    await expect(MetricPageExtras.historyTab(page)).toBeVisible();

    await MetricDetail.definitionTab(page).click();
    await expect(MetricEditor.queryEditor(page)).toBeVisible();
    await expect(
      getNotebookStep(page, "data").getByText("Orders", { exact: true }),
    ).toBeVisible();

    await MetricPageExtras.historyTab(page).click();
    // should("have.length.gte", 1)
    const revisions = page.getByTestId("revision-history-event");
    await expect(revisions.first()).toBeVisible();
    expect(await revisions.count()).toBeGreaterThanOrEqual(1);

    await MetricEditor.aboutTab(page).click();
    await expect(MetricPage.aboutPage(page)).toBeVisible();
  });

  test("should render dimension charts on the overview tab and show more", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_TIMESERIES_METRIC);
    await visitMetric(page, metric.id);

    await MetricPageExtras.overviewTab(page).click();
    const overview = MetricPageExtras.overviewPage(page);
    await expect(overview).toBeVisible();

    // PINNED, sample-data derived — see the header note on CI drift.
    for (const name of ["By Created At", "By State", "By Category", "By City"]) {
      await expect(overview.getByText(name, { exact: true })).toHaveCount(1);
    }
    await expect(overview.getByText(/^By /)).toHaveCount(4);

    await overview.getByText("Show more", { exact: true }).scrollIntoViewIfNeeded();
    await overview.getByText("Show more", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "metric_page_show_more_clicked",
    });

    for (const name of ["By Name", "By Source", "By Title", "By Vendor"]) {
      await expect(overview.getByText(name, { exact: true })).toHaveCount(1);
    }
    await expect(overview.getByText(/^By /)).toHaveCount(8);
  });

  test("should edit, save, and cancel metric definition changes", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await page.goto(`/metric/${metric.id}/query`);

    await expect(MetricEditor.queryEditor(page)).toBeVisible();

    // cancel reverts changes
    await getNotebookStep(page, "summarize")
      .getByRole("button", { name: "Count", exact: true })
      .click();
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();
    await expect(MetricEditor.saveButton(page)).toBeVisible();
    await MetricEditor.cancelButton(page).click();
    await expect(
      getNotebookStep(page, "summarize").getByText("Count", { exact: true }),
    ).toBeVisible();

    // save persists changes
    await getNotebookStep(page, "summarize")
      .getByRole("button", { name: "Count", exact: true })
      .click();
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();
    const saveUpdate = waitForUpdateCard(page);
    await MetricEditor.saveButton(page).click();
    await saveUpdate;
    await expect(
      getNotebookStep(page, "summarize").getByText("Sum of Total", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(undoToast(page)).toContainText("Metric query updated");
    await undoToast(page).getByRole("img", { name: /close/ }).click();
    // See the UndoListing note in the header: without Cypress's MockGroup the
    // exit transition is real, so wait for the toast to actually leave the DOM.
    await expect(undoToast(page)).toHaveCount(0);

    // surface backend error when a revert fails (UXW-310).
    // Upstream supplies an explicit body and asserts its text, so fulfilling
    // with that JSON is faithful (the bodyless-500 rule does not apply).
    await page.route("**/api/revision/revert", async (route) => {
      if (route.request().method() !== "POST") {
        return route.fallback();
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Cannot revert: missing metric" }),
      });
    });
    const failedRevert = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/revision/revert",
    );

    await MetricPageExtras.historyTab(page).click();
    await page
      .getByTestId("saved-question-history-list")
      .getByTestId("question-revert-button")
      .first()
      .click();
    await failedRevert;

    await expect(undoToast(page)).toContainText("Cannot revert: missing metric");
  });

  test("should add metric to dashboard and move to trash via more menu", async ({
    page,
    mb,
  }) => {
    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await visitMetric(page, metric.id);

    // add to dashboard
    await MetricPage.moreMenu(page).click();
    await popover(page)
      .getByText("Add to a dashboard", { exact: true })
      .click();
    await expect(
      modal(page).getByRole("heading", {
        name: "Add this metric to a dashboard",
        exact: true,
      }),
    ).toBeVisible();
    await modal(page)
      .getByText("Orders in a dashboard", { exact: true })
      .click();
    await modal(page)
      .getByRole("button", { name: "Select", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(
        `/dashboard/${ORDERS_DASHBOARD_ID}-orders-in-a-dashboard(\\?|$)`,
      ),
    );

    // move to trash
    await visitMetric(page, metric.id);
    await MetricPage.moreMenu(page).click();
    await popover(page).getByText("Move to trash", { exact: true }).click();
    const archiveUpdate = waitForUpdateCard(page);
    await modal(page)
      .getByRole("button", { name: "Move to trash", exact: true })
      .click();
    await archiveUpdate;
    await expect(
      main(page).getByText("This metric is in the trash.", { exact: true }),
    ).toBeVisible();
  });

  test("should restrict editing controls and definition tab for read-only users", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
    await mb.signIn("readonly");
    await visitMetric(page, metric.id);

    // about page hides editing controls
    await expect(MetricPage.aboutPage(page)).toBeVisible();
    await expectNoDisplayValue(page, "Orders count");
    await MetricPage.moreMenu(page).click();
    await expect(
      popover(page).getByText("Bookmark", { exact: true }),
    ).toBeVisible();
    await expect(
      popover(page).getByText("Add to a dashboard", { exact: true }),
    ).toBeVisible();
    await expect(popover(page).getByText("Move", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      popover(page).getByText("Duplicate", { exact: true }),
    ).toHaveCount(0);
    await expect(
      popover(page).getByText("Move to trash", { exact: true }),
    ).toHaveCount(0);

    // overview and definition tabs are hidden for read-only users
    await page.keyboard.press("Escape");
    await expect(MetricPageExtras.overviewTab(page)).toHaveCount(0);
    await expect(MetricDetail.definitionTab(page)).toHaveCount(0);
  });

  test.describe("ee features", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires the pro-self-hosted token (CYPRESS_MB_PRO_SELF_HOSTED_TOKEN)",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should show and hide 'Open in Data Studio' based on context", async ({
      page,
      mb,
    }) => {
      const { trustedMetricId } = await createLibraryWithItems(mb.api);

      // metric page shows 'Open in Data Studio'
      await visitMetric(page, trustedMetricId);
      await MetricPage.moreMenu(page).click();
      await expect(
        popover(page).getByText("Open in Data Studio", { exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      // Data Studio route hides 'Open in Data Studio'
      await page.goto(`/data-studio/library/metrics/${trustedMetricId}`);
      await expect(MetricPage.aboutPage(page)).toBeVisible();
      await MetricPage.moreMenu(page).click();
      await expect(
        popover(page).getByText("Open in Data Studio", { exact: true }),
      ).toHaveCount(0);
    });

    test("should navigate to usage analytics dashboard from more menu", async ({
      page,
      mb,
    }) => {
      const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await visitMetric(page, metric.id);

      await MetricPage.moreMenu(page).click();
      const link = popover(page)
        .getByText("Metric usage analytics", { exact: true })
        .locator("xpath=ancestor-or-self::a[1]");
      await expect(link).toHaveAttribute(
        "href",
        new RegExp(`question_id=${metric.id}`),
      );

      // .invoke("removeAttr", "target") — the item is target="_blank"; strip it
      // so the click navigates this page instead of opening a tab.
      await link.evaluate((element) => element.removeAttribute("target"));
      await link.click();

      await expect(page).toHaveURL(new RegExp(`\\?.*question_id=${metric.id}`));
      await expect(
        main(page).getByText("Question overview", { exact: true }),
      ).toBeVisible();
    });

    test("should show the Dependencies tab with dependency graph in EE", async ({
      page,
      mb,
    }) => {
      const metric = await mb.api.createQuestion(ORDERS_SCALAR_METRIC);
      await waitForBackfillComplete(mb.api);
      await visitMetric(page, metric.id);

      const sidebar = MetricDetail.aboutPageDescriptionSidebar(page);
      await expect(
        sidebar.getByText("Relationships", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("No dependencies", { exact: true }),
      ).toBeVisible();
      await expect(
        sidebar.getByText("No charts use this metric", { exact: true }),
      ).toBeVisible();

      await MetricDetail.dependenciesTab(page).click();
      const graph = DependencyGraph.graph(page);
      // Upstream's `cy.findByText("Table")` has no assertion chained, but the
      // implicit existence check inside findByText makes it load-bearing.
      await expect(graph.getByText("Table", { exact: true })).toHaveCount(1);
      await expect(graph.getByText("Orders", { exact: true })).toBeVisible();
      await expect(
        graph.getByText("Orders count", { exact: true }),
      ).toBeVisible();
    });
  });
});
