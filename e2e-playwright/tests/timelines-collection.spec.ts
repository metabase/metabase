/**
 * Playwright port of
 * e2e/test/scenarios/organization/timelines-collection.cy.spec.js
 *
 * Timelines managed from the COLLECTION view (the /collection/:id/timelines
 * modal), as opposed to timelines-question.spec.ts (the question sidebar).
 *
 * Port notes:
 * - The shared timeline API helpers (createTimeline / createTimelineWithEvents)
 *   are imported READ-ONLY from support/timelines.ts — a consolidation dividend;
 *   nothing here re-implements them. Only openMenu / setFormattingSettings and
 *   the request-wait helpers (spec-local in Cypress) live in
 *   support/timelines-collection.ts.
 * - cy.intercept(...).as() + cy.wait("@x") pairs (the admin beforeEach registered
 *   them all globally) → page.waitForResponse registered at the true trigger
 *   (PORTING.md rule 2).
 * - cy.findByText string args are exact (rule 1).
 * - The final "scenarios > collections > timelines" describe is snowplow-tagged.
 *   Only the self-describing `new_event_created` event is asserted: the per-slot
 *   collector records self-describing (`ue`) events only, so upstream's four
 *   `page_view` assertions are not observable here (see
 *   findings-inbox/timelines-collection-snowplow.md).
 * - cy.icon(name).should("be.visible") is an ANY-match → .filter({visible:true})
 *   .first() (rule 3 / wave-9 gotcha).
 */
import type { Locator, Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import { findByDisplayValue } from "../support/filters-repros";
import { entityPickerModal } from "../support/notebook";
import { getFullName, USER_NAMES } from "../support/onboarding";
import { ADMIN_PERSONAL_COLLECTION_ID } from "../support/permissions";
import { FIRST_COLLECTION_ID } from "../support/sample-data";
import { main } from "../support/sharing";
import {
  createTimeline,
  createTimelineWithEvents,
} from "../support/timelines";
import {
  openMenu,
  setFormattingSettings,
  waitForCreateEvent,
  waitForCreateTimeline,
  waitForDeleteEvent,
  waitForDeleteTimeline,
  waitForGetTimeline,
  waitForUpdateCollection,
  waitForUpdateEvent,
  waitForUpdateTimeline,
} from "../support/timelines-collection";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { icon, modal, popover } from "../support/ui";

function eventList(page: Page): Locator {
  return page.getByTestId("event-list");
}

function eventForm(page: Page): Locator {
  return page.getByTestId("event-form");
}

function collectionMenu(page: Page): Locator {
  return page.getByTestId("collection-menu");
}

/** cy.icon(name).should("be.visible") on a possibly-multi subject. */
function visibleIcon(scope: Locator | Page, name: string): Locator {
  return icon(scope, name).filter({ visible: true }).first();
}

test.describe("scenarios > organization > timelines > collection", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
  });

  test.describe("as admin", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.signInAsAdmin();
    });

    test("should create and edit an event with a date", async ({ page }) => {
      await page.goto("/collection/root");
      await collectionMenu(page).locator(".Icon-calendar").click();

      await page.getByRole("button", { name: "Create event" }).click();

      const form = eventForm(page);
      await form.getByLabel("Event name", { exact: true }).fill("RC1");
      await expect(form.getByText(/via markdown/)).toBeVisible();
      await form
        .getByLabel("Description", { exact: true })
        .fill("*1.0-rc1* release");
      await form.getByLabel("Date", { exact: true }).fill("10/20/2026");
      let createEvent = waitForCreateEvent(page);
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(
        eventList(page).getByText("RC1", { exact: true }),
      ).toBeVisible();
      await expect(
        eventList(page).getByText("October 20, 2026", { exact: true }),
      ).toBeVisible();
      await expect(visibleIcon(eventList(page), "star")).toBeVisible();

      await page.getByRole("button", { name: "Create event" }).click();

      await form.getByLabel("Event name", { exact: true }).fill("RC2");
      await form.getByLabel("Date", { exact: true }).fill("5/12/2027");
      await form.getByText("Event name", { exact: true }).click(); // blur
      await form.getByLabel("Icon", { exact: true }).click();

      await popover(page).getByText(/Cake/).click();
      createEvent = waitForCreateEvent(page);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(
        eventList(page).getByText("RC2", { exact: true }),
      ).toBeVisible();
      await expect(
        eventList(page).getByText("May 12, 2027", { exact: true }),
      ).toBeVisible();
      await expect(visibleIcon(eventList(page), "cake")).toBeVisible();
      await expect(
        eventList(page).getByText("1.0-rc1", { exact: true }),
      ).toBeVisible();

      await openMenu(page, "RC1");
      await popover(page).getByText("Edit event", { exact: true }).click();
      const nameInput = page.getByLabel("Event name", { exact: true });
      await nameInput.click();
      await nameInput.press("ControlOrMeta+A");
      await nameInput.fill("RC33");
      const updateEvent = waitForUpdateEvent(page);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updateEvent;

      await expect(
        eventList(page).getByText("RC33", { exact: true }),
      ).toBeVisible();
    });

    test("should create an event in a personal collection", async ({ page }) => {
      await page.goto(`/collection/${ADMIN_PERSONAL_COLLECTION_ID}`);
      await collectionMenu(page).locator(".Icon-calendar").click();

      await page.getByRole("button", { name: "Create event" }).click();

      const form = eventForm(page);
      await form.getByLabel("Event name", { exact: true }).fill("RC1");
      await form.getByLabel("Date", { exact: true }).fill("10/20/2026");
      const createEvent = waitForCreateEvent(page);
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(
        eventList(page).getByText("RC1", { exact: true }),
      ).toBeVisible();
    });

    test("should search for events", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        events: [
          { name: "RC1" },
          { name: "RC2" },
          { name: "v1.0" },
          { name: "v1.1" },
        ],
      });

      await page.goto("/collection/root/timelines");

      await page
        .getByPlaceholder("Search for an event", { exact: true })
        .pressSequentially("V1");
      await expect(
        eventList(page).getByText("v1.0", { exact: true }),
      ).toBeVisible();
      await expect(
        eventList(page).getByText("v1.1", { exact: true }),
      ).toBeVisible();
      await expect(
        eventList(page).getByText("RC1", { exact: true }),
      ).toHaveCount(0);
      await expect(
        eventList(page).getByText("RC2", { exact: true }),
      ).toHaveCount(0);
    });

    test("should create an event with date and time", async ({ page }) => {
      await page.goto("/collection/root/timelines");

      await page.getByRole("button", { name: "Create event" }).click();
      await page.getByLabel("Event name", { exact: true }).fill("RC1");

      const form = eventForm(page);
      // adding the time first reproduces metabase#62999
      await form.getByRole("button", { name: "Add time" }).click();
      await form.getByLabel("Time", { exact: true }).fill("10:20");

      await form.getByLabel("Date", { exact: true }).fill("10/20/2026");
      const createEvent = waitForCreateEvent(page);
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(
        modal(page).getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
      await expect(
        eventList(page).getByText("RC1", { exact: true }),
      ).toBeVisible();
      await expect(eventList(page).getByText(/10:20 AM/)).toBeVisible();
    });

    test("should create an event with date and time at midnight", async ({
      page,
    }) => {
      await page.goto("/collection/root/timelines");

      await page.getByRole("button", { name: "Create event" }).click();
      await page.getByLabel("Event name", { exact: true }).fill("RC1");

      const form = eventForm(page);
      await form.getByLabel("Date", { exact: true }).fill("10/20/2026");
      await form.getByRole("button", { name: "Add time" }).click();
      await form.getByLabel("Time", { exact: true }).fill("00:00");
      const createEvent = waitForCreateEvent(page);
      await form.getByRole("button", { name: "Create", exact: true }).click();
      await createEvent;

      await expect(
        modal(page).getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
      await expect(
        eventList(page).getByText("RC1", { exact: true }),
      ).toBeVisible();
      await expect(eventList(page).getByText(/12:00 AM/)).toBeVisible();
    });

    test("should move an event", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Metrics" },
        events: [{ name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");
      await modal(page).getByText("Metrics", { exact: true }).click();
      await openMenu(page, "RC2");
      await page.getByText("Move event", { exact: true }).click();
      await page.getByText("Releases", { exact: true }).click();
      const updateEvent = waitForUpdateEvent(page);
      await modal(page).getByRole("button", { name: "Move", exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC2", { exact: true })).toHaveCount(0);

      await icon(page, "chevronleft").click();
      await page.getByText("Releases", { exact: true }).click();
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
      await expect(page.getByText("RC2", { exact: true })).toBeVisible();
    });

    test("should move an event and undo", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Metrics" },
        events: [{ name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");
      await modal(page).getByText("Metrics", { exact: true }).click();
      await openMenu(page, "RC2");
      await page.getByText("Move event", { exact: true }).click();
      await page.getByText("Releases", { exact: true }).click();
      let updateEvent = waitForUpdateEvent(page);
      await modal(page).getByRole("button", { name: "Move", exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC2", { exact: true })).toHaveCount(0);

      updateEvent = waitForUpdateEvent(page);
      await page.getByText("Undo", { exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC2", { exact: true })).toBeVisible();
    });

    test("should archive an event when editing this event", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");

      await openMenu(page, "RC1");
      await page.getByText("Edit event", { exact: true }).click();
      const updateEvent = waitForUpdateEvent(page);
      await page.getByText("Archive event", { exact: true }).click();
      await updateEvent;

      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(page.getByText("RC1", { exact: true })).toHaveCount(0);
    });

    test("should archive an event from the timeline and undo", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");

      await openMenu(page, "RC1");
      let updateEvent = waitForUpdateEvent(page);
      await page.getByText("Archive event", { exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC1", { exact: true })).toHaveCount(0);

      updateEvent = waitForUpdateEvent(page);
      await page.getByText("Undo", { exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
    });

    test("should unarchive an event from the archive and undo", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", archived: true }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("View archived events", { exact: true }).click();

      await expect(
        page.getByText("Archived events", { exact: true }),
      ).toBeVisible();
      await openMenu(page, "RC1");

      let updateEvent = waitForUpdateEvent(page);
      await page.getByText("Unarchive event", { exact: true }).click();
      await updateEvent;
      await expect(
        page.getByText("No events found", { exact: true }),
      ).toBeVisible();

      updateEvent = waitForUpdateEvent(page);
      await page.getByText("Undo", { exact: true }).click();
      await updateEvent;
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
    });

    test("should delete an event", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1", archived: true }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("View archived events", { exact: true }).click();

      await expect(
        page.getByText("Archived events", { exact: true }),
      ).toBeVisible();
      await openMenu(page, "RC1");
      await page.getByText("Delete event", { exact: true }).click();
      const deleteEvent = waitForDeleteEvent(page);
      await page.getByText("Delete", { exact: true }).click();
      await deleteEvent;
      await expect(
        page.getByText("No events found", { exact: true }),
      ).toBeVisible();
    });

    test("should allow navigating back to the list of timelines", async ({
      page,
      mb,
    }) => {
      await createTimeline(mb.api, { name: "Releases" });
      await createTimeline(mb.api, { name: "Metrics" });

      await page.goto("/collection/root/timelines/1");
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();

      await icon(page, "chevronleft").click();
      await expect(modal(page).getByText("Releases", { exact: true })).toBeVisible();
      await expect(modal(page).getByText("Metrics", { exact: true })).toBeVisible();
    });

    test("should not allow navigating back when there is only one timeline in a collection", async ({
      page,
      mb,
    }) => {
      await createTimeline(mb.api, { name: "Releases" });

      await page.goto("/collection/root/timelines/1");
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(icon(page, "chevronleft")).toHaveCount(0);
    });

    test("should create an additional timeline", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("New timeline", { exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Launches");

      await page.getByLabel("Default icon", { exact: true }).click();
      await popover(page).getByText("Cake", { exact: true }).click();
      await expect(page.getByLabel("Default icon", { exact: true })).toHaveValue(
        "Cake",
      );

      const createTimelineWait = waitForCreateTimeline(page);
      await page.getByText("Create", { exact: true }).click();
      await createTimelineWait;

      await expect(page.getByText("Launches", { exact: true })).toBeVisible();
      await expect(page.getByText("Create event", { exact: true })).toBeVisible();
    });

    test("should edit a timeline", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("Edit timeline details", { exact: true }).click();
      const nameInput = page.getByLabel("Name", { exact: true });
      await nameInput.click();
      await nameInput.press("ControlOrMeta+A");
      await nameInput.fill("Launches");
      const updateTimeline = waitForUpdateTimeline(page);
      await page.getByText("Update", { exact: true }).click();
      await updateTimeline;

      await expect(page.getByText("Launches", { exact: true })).toBeVisible();
    });

    test("should move a timeline", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Events", default: true },
        events: [{ name: "RC1" }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Our analytics events");
      await popover(page).getByText("Move timeline", { exact: true }).click();

      const picker = entityPickerModal(page);
      await picker
        .getByText("Bobby Tables's Personal Collection", { exact: true })
        .click();
      const updateTimeline = waitForUpdateTimeline(page);
      await picker.getByRole("button", { name: "Move", exact: true }).click();
      await updateTimeline;

      await expect(
        modal(page).getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
      await modal(page).getByRole("button", { name: /close/ }).click();
      await expect(
        main(page).getByText(
          `${getFullName(USER_NAMES.admin)}'s Personal Collection`,
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should archive a timeline and undo", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("Edit timeline details", { exact: true }).click();
      let updateTimeline = waitForUpdateTimeline(page);
      await page
        .getByText("Archive timeline and all events", { exact: true })
        .click();
      await updateTimeline;
      await expect(
        page.getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Create event", { exact: true })).toBeVisible();

      updateTimeline = waitForUpdateTimeline(page);
      await page.getByText("Undo", { exact: true }).click();
      await updateTimeline;
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(page.getByText("RC1", { exact: true })).toBeVisible();
      await expect(page.getByText("RC2", { exact: true })).toBeVisible();
    });

    test("should support markdown in timeline description", async ({
      page,
      mb,
    }) => {
      await createTimeline(mb.api, {
        name: "Releases",
        description: "[Release notes](https://metabase.test)",
      });

      await createTimeline(mb.api, {
        name: "Holidays",
        description: "[Holiday list](https://metabase.test)",
      });

      await page.goto("/collection/root/timelines");
      await expect(
        page.getByText("Release notes", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Holiday list", { exact: true }),
      ).toBeVisible();
    });

    test("should support markdown in event description", async ({
      page,
      mb,
    }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: {
          name: "Releases",
        },
        events: [
          {
            name: "RC1",
            description: "[Release notes](https://metabase.test)",
          },
        ],
      });

      await page.goto("/collection/root/timelines");
      await expect(
        page.getByText("Release notes", { exact: true }),
      ).toBeVisible();
    });

    test("should archive and unarchive a timeline", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("Edit timeline details", { exact: true }).click();
      let updateTimeline = waitForUpdateTimeline(page);
      await page
        .getByText("Archive timeline and all events", { exact: true })
        .click();
      await updateTimeline;

      await openMenu(page, "Our analytics events");
      await page.getByText("View archived timelines", { exact: true }).click();

      await openMenu(page, "Releases");
      updateTimeline = waitForUpdateTimeline(page);
      await page.getByText("Unarchive timeline", { exact: true }).click();
      await updateTimeline;
      await expect(
        page.getByText("No timelines found", { exact: true }),
      ).toBeVisible();
      await modal(page).locator(".Icon-chevronleft").click();
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
    });

    test("should archive and delete a timeline", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }, { name: "RC2" }],
      });

      await page.goto("/collection/root/timelines");
      await openMenu(page, "Releases");
      await page.getByText("Edit timeline details", { exact: true }).click();
      const updateTimeline = waitForUpdateTimeline(page);
      await page
        .getByText("Archive timeline and all events", { exact: true })
        .click();
      await updateTimeline;

      await openMenu(page, "Our analytics events");
      await page.getByText("View archived timelines", { exact: true }).click();

      await openMenu(page, "Releases");
      await page.getByText("Delete timeline", { exact: true }).click();
      const deleteTimeline = waitForDeleteTimeline(page);
      await page.getByText("Delete", { exact: true }).click();
      await deleteTimeline;
      await expect(
        page.getByText("No timelines found", { exact: true }),
      ).toBeVisible();
      await modal(page).locator(".Icon-chevronleft").click();
      await expect(
        page.getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
    });

    test("should preserve collection names for default timelines", async ({
      page,
    }) => {
      await page.goto(`/collection/${FIRST_COLLECTION_ID}/timelines`);

      await page.getByText("Create event", { exact: true }).click();
      await page.getByLabel("Event name", { exact: true }).fill("RC1");
      await page.getByLabel("Date", { exact: true }).fill("10/20/2026");
      const createTimelineWait = waitForCreateTimeline(page);
      await page.getByRole("button", { name: "Create", exact: true }).click();
      await expect(
        page.getByText("First collection events", { exact: true }),
      ).toBeVisible();
      await createTimelineWait;
      await icon(page, "close").click();

      const collectionName = await findByDisplayValue(
        page.locator("body"),
        "First collection",
      );
      await collectionName.click();
      await collectionName.press("ControlOrMeta+A");
      await collectionName.pressSequentially("1st collection");
      const updateCollection = waitForUpdateCollection(page);
      await collectionName.blur();
      await updateCollection;

      await icon(page, "calendar").click();
      await openMenu(page, "1st collection events");
      await page.getByText("Edit timeline details", { exact: true }).click();
      const nameInput = page.getByLabel("Name", { exact: true });
      await nameInput.click();
      await nameInput.press("ControlOrMeta+A");
      await nameInput.fill("Releases");
      const updateTimeline = waitForUpdateTimeline(page);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updateTimeline;
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
    });

    test("should use custom date formatting settings", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        events: [{ name: "RC1", timestamp: "2022-10-12T18:15:30Z" }],
      });
      await setFormattingSettings(mb.api, {
        "type/Temporal": { date_style: "YYYY/M/D" },
      });
      await page.goto("/collection/root/timelines");

      await openMenu(page, "RC1");
      await page.getByText("Edit event", { exact: true }).click();
      // cy.findByDisplayValue("2022/10/12").should("be.visible") — asserted on
      // the Date field directly so it retries while the edit form populates
      // (the shared findByDisplayValue is a one-shot scan).
      const dateInput = page.getByLabel("Date", { exact: true });
      await expect(dateInput).toHaveValue("2022/10/12");

      await dateInput.fill("2022/10/15");
      const updateEvent = waitForUpdateEvent(page);
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await updateEvent;
      await expect(page.getByText("2022/10/15", { exact: true })).toBeVisible();
    });

    test("should use custom time formatting settings", async ({ page, mb }) => {
      await createTimelineWithEvents(mb.api, {
        events: [
          {
            name: "RC1",
            timestamp: "2022-10-12T18:15:30Z",
            time_matters: true,
          },
        ],
      });
      await setFormattingSettings(mb.api, {
        "type/Temporal": { time_style: "HH:mm" },
      });
      const getTimeline = waitForGetTimeline(page);
      await page.goto("/collection/root/timelines");
      await getTimeline;

      await expect(
        eventList(page).getByText("October 12, 2022, 18:15", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("as readonly user", () => {
    test("should not allow creating new timelines in collections", async ({
      page,
      mb,
    }) => {
      await mb.signIn("readonly");
      await page.goto("/collection/root");

      await icon(page, "calendar").click();
      await expect(
        page.getByText("Our analytics events", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Create event", { exact: true }),
      ).toHaveCount(0);
    });

    test("should not allow creating new events in existing timelines", async ({
      page,
      mb,
    }) => {
      await mb.signInAsAdmin();
      await createTimelineWithEvents(mb.api, {
        timeline: { name: "Releases" },
        events: [{ name: "RC1" }],
      });
      await mb.signOut();

      await mb.signIn("readonly");
      await page.goto("/collection/root");
      await icon(page, "calendar").click();
      await expect(page.getByText("Releases", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Create event", { exact: true }),
      ).toHaveCount(0);
    });
  });
});

test.describe("scenarios > collections > timelines", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should send snowplow events when creating a timeline event", async ({
    page,
    mb,
  }) => {
    await page.goto("/collection/root");

    // Upstream also asserts four `page_view` events across this flow; the
    // per-slot collector records only self-describing events, so they are not
    // observable here (findings-inbox/timelines-collection-snowplow.md).

    await icon(page, "calendar").click();

    await page.getByText("Create event", { exact: true }).click();
    await page.getByLabel("Event name", { exact: true }).fill("Event");
    await page.getByLabel("Date", { exact: true }).fill("10/20/2026");

    const createEvent = waitForCreateEvent(page);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await createEvent;
    await expectUnstructuredSnowplowEvent(mb, { event: "new_event_created" });
  });
});
