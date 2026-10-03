/**
 * Playwright port of
 * e2e/test/scenarios/organization/timelines-question.cy.spec.js
 *
 * Timelines = events overlaid on time-series questions.
 *
 * Notes:
 * - cy.intercept(...).as() + cy.wait("@x") pairs → page.waitForResponse
 *   registered before the triggering action, awaited after (PORTING.md rule 2).
 *   The admin describe's beforeEach registered @getCollection / @createEvent /
 *   @updateEvent globally; here each is registered inline at its true trigger.
 * - H.visitQuestionAdhoc native + autorun → visitNativeQuestionAdhoc
 *   (charts-extras) which runs the query itself.
 * - cy.findByText string args are exact (rule 1).
 */
import type { Locator, Page } from "@playwright/test";

import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { visitQuestionAdhoc } from "../support/permissions";
import { ORDERS_BY_YEAR_QUESTION_ID, rightSidebar } from "../support/question-saved";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  createTimeline,
  createTimelineWithEvents,
  timelineCardHeader,
  timelineEventCard,
  timelineEventChip,
  timelineEventVisibility,
  toggleEventVisibility,
  waitForTimelinesAfterCreatingAnEvent,
} from "../support/timelines";
import { icon, modal, popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/** Register the GET /api/collection/root wait (the admin beforeEach's
 * @getCollection). Register before the navigation that fires it. */
function waitForCollectionRoot(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/collection/root" &&
      response.request().method() === "GET",
  );
}

/** Register the POST /api/timeline-event wait (@createEvent). */
function waitForCreateEvent(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/timeline-event" &&
      response.request().method() === "POST",
  );
}

/** Register the PUT /api/timeline-event/** wait (@updateEvent). */
function waitForUpdateEvent(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      /^\/api\/timeline-event\/\d+/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PUT",
  );
}

/** Register the POST /api/dataset wait (the visitQuestionAdhoc @dataset alias). */
function waitForDataset(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dataset" &&
      response.request().method() === "POST",
  );
}

function viewFooterVisualization(page: Page): Locator {
  return page.getByText("Visualization", { exact: true });
}

test.describe("scenarios > organization > timelines > question", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("as admin", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test("should create the first event and timeline", async ({ page }) => {
      const getCollection = waitForCollectionRoot(page);
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await getCollection;
      await expect(viewFooterVisualization(page)).toBeVisible();

      await icon(page, "calendar").click();
      await page.getByText("Create event", { exact: true }).click();

      await page.getByLabel("Event name", { exact: true }).fill("RC1");
      await page.getByLabel("Date", { exact: true }).fill("10/20/2027");
      const createEvent = waitForCreateEvent(page);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(
        page.getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
    });

    test("should create an event within the default timeline", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });

      const getCollection = waitForCollectionRoot(page);
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await getCollection;
      await expect(viewFooterVisualization(page)).toBeVisible();

      await icon(page, "calendar").click();
      await page.getByText("Create event", { exact: true }).click();

      await page.getByLabel("Event name", { exact: true }).fill("RC2");
      await page.getByLabel("Date", { exact: true }).fill("10/30/2027");
      const createEvent = waitForCreateEvent(page);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
      await expect(page.getByText("RC2", { exact: true })).toBeVisible();
    });

    test("should display all events in data view", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          { name: "v1", timestamp: "2030-01-01T00:00:00Z" },
          { name: "v2", timestamp: "2026-01-01T00:00:00Z" },
          { name: "v3", timestamp: "2029-01-01T00:00:00Z" },
        ],
      });

      const getCollection = waitForCollectionRoot(page);
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await getCollection;
      await expect(viewFooterVisualization(page)).toBeVisible();

      await page.getByLabel("calendar icon", { exact: true }).click();
      await expect(page.getByText("v1", { exact: true })).toHaveCount(0);
      await expect(page.getByText("v2", { exact: true })).toBeVisible();
      await expect(page.getByText("v3", { exact: true })).toBeVisible();

      // The display toggle is a SegmentedControl whose segments carry
      // disabled: true — the click handler lives on the root, so the disabled
      // input must be force-clicked (Cypress's bubbling click reached the root).
      await page
        .getByLabel("Switch to data", { exact: true })
        .click({ force: true });
      await expect(page.getByText("v1", { exact: true })).toBeVisible();
      await expect(page.getByText("v2", { exact: true })).toBeVisible();
      await expect(page.getByText("v3", { exact: true })).toBeVisible();
    });

    test("should edit an event", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });

      const getCollection = waitForCollectionRoot(page);
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await getCollection;
      await expect(viewFooterVisualization(page)).toBeVisible();

      await icon(page, "calendar").click();
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await icon(rightSidebar(page), "ellipsis").click();
      await page.getByText("Edit event", { exact: true }).click();

      await page.getByLabel("Event name", { exact: true }).fill("RC2");
      const updateEvent = waitForUpdateEvent(page);
      await page.getByText("Update", { exact: true }).click();
      await updateEvent;

      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(page.getByText("RC2", { exact: true })).toBeVisible();
    });

    test("should move an event", async ({ page, mb }) => {
      await createTimeline(mb.api, { name: "Releases" });
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Builds" },
        events: [{ name: "RC2", timestamp: "2027-10-20T00:00:00Z" }],
      });

      const getCollection = waitForCollectionRoot(page);
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await getCollection;
      await expect(viewFooterVisualization(page)).toBeVisible();

      await icon(page, "calendar").click();
      await expect(page.getByText("Builds", { exact: true })).toBeVisible();
      await icon(rightSidebar(page), "ellipsis").click();
      await page.getByText("Move event", { exact: true }).click();
      await page.getByText("Releases", { exact: true }).click();
      const updateEvent = waitForUpdateEvent(page);
      await page.getByRole("button", { name: "Move", exact: true }).click();
      await updateEvent;

      await expect(page.getByText("Builds", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
    });

    test("should archive and unarchive an event", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });

      const getCollection = waitForCollectionRoot(page);
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await getCollection;
      await expect(viewFooterVisualization(page)).toBeVisible();

      await icon(page, "calendar").click();
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await icon(rightSidebar(page), "ellipsis").click();
      let updateEvent = waitForUpdateEvent(page);
      await page.getByText("Archive event", { exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC1", { exact: true })).toHaveCount(0);

      updateEvent = waitForUpdateEvent(page);
      await page.getByText("Undo", { exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
    });

    test("should support markdown in event description", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          {
            name: "RC1",
            description: "[Release notes](https://metabase.test)",
            timestamp: "2027-10-20T00:00:00Z",
          },
        ],
      });

      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await icon(page, "calendar").click();

      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Release notes", { exact: true }),
      ).toBeVisible();
    });

    test("should show events for ad-hoc questions", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [["field", ORDERS.CREATED_AT, null]],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["TOTAL"],
          "graph.metrics": ["count"],
        },
      });

      await expect(viewFooterVisualization(page)).toBeVisible();
      await expect(timelineEventChip(page, "RC1")).toBeVisible();
    });

    test("should not show events for non-timeseries questions", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.TOTAL, { binning: { strategy: "default" } }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["TOTAL"],
          "graph.metrics": ["count"],
        },
      });

      await expect(viewFooterVisualization(page)).toBeVisible();
      await expect(timelineEventChip(page, "RC1")).toHaveCount(0);
    });

    test("should show events for native queries", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });

      const getTimelines = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/timeline" &&
          response.request().method() === "GET",
      );

      // Aggregate by month so the result is a deterministic ~48-row series that
      // spans the full ORDERS date range. A raw `SELECT TOTAL, CREATED_AT FROM
      // ORDERS` is truncated to the first 2000 (unordered) rows, so the chart's
      // x-domain was non-deterministic and often fell short of the event date
      // (2027-10-20); the event then landed outside the domain, was filtered out
      // of the visible timeline events, and the star marker never rendered.
      await visitNativeQuestionAdhoc(page, {
        dataset_query: {
          type: "native",
          native: {
            query:
              "SELECT DATE_TRUNC('month', CREATED_AT) AS CREATED_AT, COUNT(*) AS TOTAL FROM ORDERS GROUP BY DATE_TRUNC('month', CREATED_AT) ORDER BY 1",
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["TOTAL"],
        },
      });

      await expect(viewFooterVisualization(page)).toBeVisible();
      await getTimelines;

      await expect(timelineEventChip(page, "RC1")).toBeVisible();
    });

    test("should toggle individual event visibility", async ({ page, mb }) => {
      const parentResponse = await mb.api.post("/api/collection", {
        name: "Parent",
        parent_id: null,
      });
      const { id: PARENT_COLLECTION_ID } = await parentResponse.json();

      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          { name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "cloud" },
        ],
      });

      await createTimelineWithEvents(mb.api, {
        timeline: {
          name: "Timeline for collection",
          collection_id: PARENT_COLLECTION_ID,
        },
        events: [
          { name: "TC1", timestamp: "2025-05-20T00:00:00Z", icon: "warning" },
        ],
      });

      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);

      await expect(
        page.getByTestId("view-footer").getByText("Visualization", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(timelineEventChip(page, "RC1")).toBeVisible();

      // should hide individual events from chart if hidden in sidebar
      await icon(page, "calendar").click();
      await page
        .getByTestId("sidebar-content")
        .getByText("Releases", { exact: true })
        .click();
      await toggleEventVisibility(page, "RC1");

      await expect(timelineEventChip(page, "RC1")).toHaveCount(0);

      // should show individual events in chart again
      await toggleEventVisibility(page, "RC1");

      await expect(timelineEventChip(page, "RC1")).toBeVisible();

      // should show a newly created event
      await page
        .getByRole("button", { name: "Create event", exact: true })
        .click();
      await page.getByLabel("Event name", { exact: true }).fill("RC2");
      await page.getByLabel("Date", { exact: true }).fill("10/20/2026");
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(
        waitForTimelinesAfterCreatingAnEvent(page, "RC2"),
      ).toBeVisible();

      await icon(undoToast(page), "close").click();
      await expect(timelineEventChip(page, "RC2")).toBeVisible();

      // should then hide the newly created event
      await expect(timelineEventVisibility(page, "RC2")).toBeChecked();
      await toggleEventVisibility(page, "RC2");
      await expect(timelineEventVisibility(page, "RC2")).not.toBeChecked();

      await expect(timelineEventChip(page, "RC2")).toHaveCount(0);

      // its timeline, visible but having one hidden event
      // should display its checkbox with a "dash" icon
      const releasesHeader = timelineCardHeader(
        page.getByTestId("sidebar-content"),
        "Releases",
      );
      await expect(icon(releasesHeader, "dash")).toBeVisible();
      // Hide the timeline then show it again
      await releasesHeader.getByRole("checkbox").click();
      await releasesHeader.getByRole("checkbox").click();

      // once timeline is visible, all its events should be visible
      await expect(timelineEventChip(page, "RC2")).toBeVisible();
      await expect(timelineEventChip(page, "RC1")).toBeVisible();

      // should initialize events in a hidden timeline
      // with event checkboxes unchecked
      await page
        .getByTestId("sidebar-content")
        .getByText("Timeline for collection", { exact: true })
        .click();

      await expect(
        timelineEventCard(
          page.getByTestId("sidebar-content"),
          "TC1",
        ).getByRole("checkbox"),
      ).not.toBeChecked();

      // making a hidden timeline visible
      // should make its events automatically visible
      await timelineCardHeader(
        page.getByTestId("sidebar-content"),
        "Timeline for collection",
      )
        .getByRole("checkbox")
        .click();

      await expect(timelineEventChip(page, "TC1")).toBeVisible();

      // events whose timeline was invisible on page load
      // should be hideable once their timelines are visible
      await toggleEventVisibility(page, "TC1");

      await expect(timelineEventChip(page, "TC1")).toHaveCount(0);

      /**
       * This tests the case where group by unit with the event in the end range
       * bucket not included when it's the only event selected.
       *
       * e.g. group by month from 2027-01-01 to 2028-01-01 with event at
       * 2028-01-15, it should be included, but was not previously
       */
      // test single event after the starting end range unit (metabase#56290)
      await page.getByText("Create event", { exact: true }).click();

      await modal(page)
        .getByLabel("Event name", { exact: true })
        .fill("Event at the end of range");
      await modal(page).getByLabel("Date", { exact: true }).fill("10/20/2029");
      await modal(page)
        .getByRole("button", { name: "Create", exact: true })
        .click();
      await expect(
        waitForTimelinesAfterCreatingAnEvent(page, "Event at the end of range"),
      ).toBeVisible();

      await expect(modal(page)).toHaveCount(0); // wait for modal to close

      // remove all other events except the new one
      await expect(await toggleEventVisibility(page, "RC1")).not.toBeChecked();
      await expect(await toggleEventVisibility(page, "RC2")).not.toBeChecked();

      // the new event should be visible in the chart
      await expect(
        timelineEventChip(page, "Event at the end of range"),
      ).toBeVisible();
    });

    test("should show a single-event popover on hover without a 'See all' link", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          { name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "star" },
        ],
      });

      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);

      await expect(timelineEventChip(page, "RC1")).toBeVisible();
      await timelineEventChip(page, "RC1").hover();

      // hovering a single event shows a compact popover with no 'See all'
      const eventPopover = page.getByTestId("timeline-event-popover");
      await expect(eventPopover.getByText("RC1", { exact: true })).toBeVisible();
      await expect(
        eventPopover.getByText("See all", { exact: true }),
      ).toHaveCount(0);
    });

    test("should show the event popover when hovering on a stacked chart #74005", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          { name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "star" },
        ],
      });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
        visualization_settings: {
          "graph.split_panels": true,
        },
      });

      await expect(timelineEventChip(page, "RC1")).toBeVisible();
      await timelineEventChip(page, "RC1").hover();
      await expect(
        page
          .getByTestId("timeline-event-popover")
          .getByText("RC1", { exact: true }),
      ).toBeVisible();
    });

    test("should collapse close events into a count chip and focus the sidebar on the group from 'See all'", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          { name: "Alpha", timestamp: "2027-10-03T00:00:00Z" },
          { name: "Beta", timestamp: "2027-10-10T00:00:00Z" },
          { name: "Gamma", timestamp: "2027-10-17T00:00:00Z" },
          { name: "Delta", timestamp: "2027-10-24T00:00:00Z" },
        ],
      });
      // a second timeline that must be filtered out while the cluster is focused
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Other" },
        events: [{ name: "Outsider", timestamp: "2028-01-15T00:00:00Z" }],
      });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      // Cypress only asserts the band's existence here (no visibility check) —
      // the band is present but its chips are opacity-hidden until laid out.
      await expect(
        page
          .getByTestId("visualization-root")
          .getByTestId("timeline-events-band"),
      ).toBeAttached();

      // the four same-month events collapse into one chip with the count
      await expect(timelineEventChip(page, "4 events")).toBeVisible();
      await expect(timelineEventChip(page, "4 events")).toContainText("4");

      // hovering shows the first three events and a 'See all' link
      await timelineEventChip(page, "4 events").hover();
      const eventPopover = page.getByTestId("timeline-event-popover");
      await expect(eventPopover.getByText("Alpha", { exact: true })).toBeVisible();
      await expect(eventPopover.getByText("Gamma", { exact: true })).toBeVisible();
      await expect(
        eventPopover.getByText("Delta", { exact: true }),
      ).toHaveCount(0);
      await eventPopover.getByText("See all", { exact: true }).click();

      // 'See all' selects the cluster and focuses the sidebar on it
      await expect(timelineEventChip(page, "4 events")).toHaveAttribute(
        "data-selected",
        "true",
      );
      const sidebar = page.getByTestId("sidebar-content");
      await expect(timelineEventCard(sidebar, "Alpha")).toBeVisible();
      await expect(timelineEventCard(sidebar, "Delta")).toBeVisible();

      // the unrelated timeline is filtered out of the focused list
      await expect(sidebar.getByText("Other", { exact: true })).toHaveCount(0);

      // 'All events' restores the full list of timelines
      await page.getByTestId("timeline-sidebar-show-all").click();
      await expect(sidebar.getByText("Other", { exact: true })).toBeVisible();
    });

    test("should focus the sidebar on the group when a grouped chip is clicked directly", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [
          { name: "Alpha", timestamp: "2027-10-03T00:00:00Z" },
          { name: "Beta", timestamp: "2027-10-10T00:00:00Z" },
        ],
      });
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Other" },
        events: [{ name: "Outsider", timestamp: "2028-01-15T00:00:00Z" }],
      });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "line",
      });

      // clicking a grouped chip focuses the sidebar on its events
      await expect(timelineEventChip(page, "2 events")).toBeVisible();
      await timelineEventChip(page, "2 events").click();

      const sidebar = page.getByTestId("sidebar-content");
      await expect(timelineEventCard(sidebar, "Alpha")).toBeVisible();
      await expect(timelineEventCard(sidebar, "Beta")).toBeVisible();
      await expect(sidebar.getByText("Other", { exact: true })).toHaveCount(0);
    });

    test("should select a single event and open the full sidebar when its chip is clicked", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-01-01T00:00:00Z" }],
      });

      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);

      await expect(timelineEventChip(page, "RC1")).toBeVisible();
      await timelineEventChip(page, "RC1").click();

      // the sidebar opens (unfiltered) with the event selected
      await expect(timelineEventChip(page, "RC1")).toHaveAttribute(
        "data-selected",
        "true",
      );
      await expect(
        page.getByTestId("sidebar-content").getByText("RC1", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByTestId("timeline-sidebar-show-all"),
      ).toHaveCount(0);
    });

    // TODO @nemanjaglumac 2026-04-17: Simplify or potentially remove this repro
    // altogether! It is hacky and it is fragile because it relies on the MAX
    // date in the ORDERS table so all timestamps need to be carefully hard
    // coded relative to it.
    // Additionally, one granularity bucket would sufficiently reproduce the
    // issue.
    test("should not filter out events in last period (metabase#23336)", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        events: [
          // All events are AFTER the ORDERS max (~Apr 19, 2029) but within
          // the last bucket of their respective granularity. The bug (#23336)
          // was that events in the last period's extended range were filtered
          // out.
          // Last week bucket is Apr 13-19 (Sun-Sat): Apr 20 is next week
          { name: "Last week", timestamp: "2029-04-20T12:00:00Z" },
          // Last month bucket is April: Apr 27 is still in April
          { name: "Last month", timestamp: "2029-04-27T12:00:00Z" },
          // Last quarter bucket is Q2: May 10 is still in Q2
          { name: "Last quarter", timestamp: "2029-05-10T12:00:00Z" },
          // Last year bucket is 2029: Sep 10 is still in 2029
          { name: "Last year", timestamp: "2029-09-10T12:00:00Z" },
        ],
      });

      await visitQuestionAdhoc(page, {
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }],
            ],
            "source-table": ORDERS_ID,
          },
        },
      });

      await icon(page, "calendar").click();

      // Week
      await expect(rightSidebar(page).getByText("Last week")).toBeVisible();
      await expect(
        rightSidebar(page).getByText("Last month"),
      ).toHaveCount(0);
      await expect(
        rightSidebar(page).getByText("Last quarter"),
      ).toHaveCount(0);
      await expect(rightSidebar(page).getByText("Last year")).toHaveCount(0);

      // Month
      let dataset = waitForDataset(page);
      await page
        .getByTestId("timeseries-chrome")
        .getByText("Week", { exact: true })
        .click();
      await popover(page).getByText("Month", { exact: true }).click();
      await dataset;
      await expect(rightSidebar(page).getByText("Last week")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last month")).toBeVisible();
      await expect(
        rightSidebar(page).getByText("Last quarter"),
      ).toHaveCount(0);
      await expect(rightSidebar(page).getByText("Last year")).toHaveCount(0);

      // Quarter
      dataset = waitForDataset(page);
      await page
        .getByTestId("timeseries-chrome")
        .getByText("Month", { exact: true })
        .click();
      await popover(page).getByText("Quarter", { exact: true }).click();
      await dataset;
      await expect(rightSidebar(page).getByText("Last week")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last month")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last quarter")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last year")).toHaveCount(0);

      // Year
      dataset = waitForDataset(page);
      await page
        .getByTestId("timeseries-chrome")
        .getByText("Quarter", { exact: true })
        .click();
      await popover(page).getByText("Year", { exact: true }).click();
      await dataset;
      await expect(rightSidebar(page).getByText("Last week")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last month")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last quarter")).toBeVisible();
      await expect(rightSidebar(page).getByText("Last year")).toBeVisible();
    });
  });

  test.describe("as readonly user", () => {
    test("should not allow creating default timelines", async ({ page, mb }) => {
      await mb.signIn("readonly");
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await expect(
        page.getByText("Created At: Year", { exact: true }),
      ).toBeVisible();

      await icon(page, "calendar").click();
      await expect(page.getByText(/Events in Metabase/)).toBeVisible();
      await expect(
        page.getByText("Create event", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not allow creating or editing events", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      });
      await mb.signOut();
      await mb.signIn("readonly");
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);
      await expect(
        page.getByText("Created At: Year", { exact: true }),
      ).toBeVisible();

      await icon(page, "calendar").click();
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Create event", { exact: true }),
      ).toHaveCount(0);
      await expect(icon(rightSidebar(page), "ellipsis")).toHaveCount(0);
    });
  });
});
