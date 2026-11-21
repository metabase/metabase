import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderRoutes, screen, waitFor, within } from "__support__/ui";
import { collectionApi } from "metabase/api";
import { dayjs } from "metabase/dayjs";
import { Outlet } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import type {
  Collection,
  FormattingSettings,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { getCollectionTimelineRoutes } from "./routes";
import { setupTimelineServer } from "./test-utils/fake-timeline-server";

const ROOT = createMockCollection({ id: "root", name: "Our analytics" });
const FIRST = createMockCollection({ id: 9, name: "First collection" });
const PERSONAL = createMockCollection({
  id: 2,
  name: "Bobby Tables's Personal Collection",
  personal_owner_id: 1,
  is_personal: true,
});

function CollectionPage() {
  return (
    <div>
      <span>Collection page</span>
      <Outlet />
    </div>
  );
}

const ROUTES = [
  {
    path: "collection/:slug",
    element: <CollectionPage />,
    children: getCollectionTimelineRoutes(),
  },
];

interface SetupOpts {
  initialRoute: string;
  collections?: Collection[];
  timelines?: Timeline[];
  events?: TimelineEvent[];
  formattingSettings?: FormattingSettings;
}

function setup({
  initialRoute,
  collections = [ROOT],
  timelines,
  events,
  formattingSettings,
}: SetupOpts) {
  const server = setupTimelineServer({ collections, timelines, events });
  const settings = mockSettings(
    formattingSettings ? { "custom-formatting": formattingSettings } : {},
  );

  const { router, store } = renderRoutes(ROUTES, {
    initialRoute,
    withUndos: true,
    storeInitialState: createMockState({ settings }),
  });

  return {
    ...server,
    store,
    pathname: () => router?.location.pathname,
    navigate: (path: string) => act(() => router?.navigate(path)),
  };
}

const releases = (opts?: Partial<Timeline>) =>
  createMockTimeline({
    id: 2,
    name: "Releases",
    collection_id: null,
    ...opts,
  });

const event = (opts: Partial<TimelineEvent>) =>
  createMockTimelineEvent({ timeline_id: 2, ...opts });

// v65 timeline modals show their title as plain text, not as a heading
const findHeading = async (name: string) =>
  within(await screen.findByRole("dialog")).findByText(name);

const eventList = () => screen.getByTestId("event-list");

/** Opens the "⋯" menu (`label`) of the card or header that shows `text`. */
async function openMenu(text: string, label: string) {
  let element: HTMLElement | null = await screen.findByText(text);
  while (
    element != null &&
    within(element).queryAllByRole("button", { name: label }).length !== 1
  ) {
    // Event and timeline cards have no role or name of their own, so the menu
    // is found from the text it belongs to
    // eslint-disable-next-line testing-library/no-node-access
    element = element.parentElement;
  }
  await userEvent.click(
    within(checkNotNull(element)).getByRole("button", { name: label }),
  );
}

async function clickMenuItem(name: string) {
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

async function fillEventForm({ name, date }: { name: string; date: string }) {
  await userEvent.type(await screen.findByLabelText("Event name"), name);
  const dateInput = screen.getByLabelText("Date");
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, date);
}

async function setTime(time: string) {
  const timeInput = screen.getByLabelText("Time");
  await userEvent.clear(timeInput);
  await userEvent.type(timeInput, time);
}

// New events are saved with the browser's time zone; a zone that is not the
// test runner's own makes sure the form sends the guessed one.
const BROWSER_TIMEZONE = "America/Toronto";

beforeEach(() => {
  jest.spyOn(dayjs.tz, "guess").mockReturnValue(BROWSER_TIMEZONE);
});

afterEach(() => {
  mockSettings();
  jest.restoreAllMocks();
});

describe("collection timelines", () => {
  describe("events", () => {
    it("creates events in a new default timeline, then edits one", async () => {
      const { writes, pathname } = setup({
        initialRoute: "/collection/root/timelines",
      });

      await findHeading("Our analytics events");
      await userEvent.click(
        screen.getByRole("button", { name: "Create event" }),
      );
      expect(
        await screen.findByText(
          "You can add links and formatting via markdown",
        ),
      ).toBeInTheDocument();
      await fillEventForm({ name: "RC1", date: "10/20/2026" });
      await userEvent.type(
        screen.getByLabelText("Description"),
        "*1.0-rc1* release",
      );
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(pathname()).toBe("/collection/root/timelines"),
      );
      expect(writes()).toEqual([
        {
          method: "POST",
          path: "/api/timeline",
          body: expect.objectContaining({
            name: "Our analytics events",
            collection_id: null,
            default: true,
          }),
        },
        {
          method: "POST",
          path: "/api/timeline-event",
          body: expect.objectContaining({
            name: "RC1",
            timezone: BROWSER_TIMEZONE,
            description: "*1.0-rc1* release",
            // v65 sends a date-only event as the local midnight
            timestamp: dayjs("2026-10-20").toISOString(),
            time_matters: false,
            icon: "star",
            timeline_id: 100,
          }),
        },
      ]);

      await findHeading("Our analytics events");
      expect(within(eventList()).getByText("RC1")).toBeInTheDocument();
      expect(
        within(eventList()).getByText("October 20, 2026"),
      ).toBeInTheDocument();
      expect(
        within(eventList()).getByLabelText("star icon"),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Create event" }),
      );
      await fillEventForm({ name: "RC2", date: "5/12/2027" });
      await userEvent.click(screen.getByLabelText("Icon"));
      await userEvent.click(
        await screen.findByRole("option", { name: /Cake/ }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(await screen.findByText("RC2")).toBeInTheDocument();
      expect(writes()[2]).toEqual({
        method: "POST",
        path: "/api/timeline-event",
        body: expect.objectContaining({
          name: "RC2",
          timezone: BROWSER_TIMEZONE,
          // v65 sends a date-only event as the local midnight
          timestamp: dayjs("2027-05-12").toISOString(),
          icon: "cake",
          timeline_id: 100,
        }),
      });
      expect(within(eventList()).getByText("May 12, 2027")).toBeInTheDocument();
      expect(
        within(eventList()).getByLabelText("cake icon"),
      ).toBeInTheDocument();
      // The description is rendered as markdown
      expect(within(eventList()).getByText("1.0-rc1").tagName).toBe("EM");

      // RC1 is the second event in the list, after the later RC2
      await openMenu("RC1", "Event menu");
      await clickMenuItem("Edit event");
      const nameInput = await screen.findByLabelText("Event name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "RC33");
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      expect(await screen.findByText("RC33")).toBeInTheDocument();
      expect(writes()[3]).toEqual({
        method: "PUT",
        path: "/api/timeline-event/101",
        body: expect.objectContaining({ name: "RC33" }),
      });
      expect(within(eventList()).queryByText("RC1")).not.toBeInTheDocument();
      expect(within(eventList()).getByText("RC2")).toBeInTheDocument();
    });

    it("creates an event in a personal collection", async () => {
      const { writes } = setup({
        initialRoute: "/collection/2/timelines",
        collections: [ROOT, PERSONAL],
      });

      await findHeading("Bobby Tables's Personal Collection events");
      await userEvent.click(
        screen.getByRole("button", { name: "Create event" }),
      );
      await fillEventForm({ name: "RC1", date: "10/20/2026" });
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(await screen.findByText("RC1")).toBeInTheDocument();
      expect(writes()).toEqual([
        {
          method: "POST",
          path: "/api/timeline",
          body: expect.objectContaining({
            name: "Bobby Tables's Personal Collection events",
            collection_id: 2,
            default: true,
          }),
        },
        {
          method: "POST",
          path: "/api/timeline-event",
          body: expect.objectContaining({
            name: "RC1",
            timeline_id: 100,
            timezone: BROWSER_TIMEZONE,
          }),
        },
      ]);
    });

    it("creates an event with a time entered before the date (metabase#62999)", async () => {
      const { writes } = setup({ initialRoute: "/collection/root/timelines" });

      await findHeading("Our analytics events");
      await userEvent.click(
        screen.getByRole("button", { name: "Create event" }),
      );
      await userEvent.type(await screen.findByLabelText("Event name"), "RC1");
      await userEvent.click(screen.getByRole("button", { name: "Add time" }));
      await setTime("10:20");
      const dateInput = screen.getByLabelText("Date");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "10/20/2026");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(
        await screen.findByText("October 20, 2026, 10:20 AM"),
      ).toBeInTheDocument();
      expect(within(eventList()).getByText("RC1")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Our analytics events",
      );
      expect(writes()[1]).toEqual({
        method: "POST",
        path: "/api/timeline-event",
        body: expect.objectContaining({
          name: "RC1",
          timezone: BROWSER_TIMEZONE,
          timestamp: "2026-10-20T10:20:00.000Z",
          time_matters: true,
        }),
      });
    });

    it("creates an event at midnight", async () => {
      const { writes } = setup({ initialRoute: "/collection/root/timelines" });

      await findHeading("Our analytics events");
      await userEvent.click(
        screen.getByRole("button", { name: "Create event" }),
      );
      await fillEventForm({ name: "RC1", date: "10/20/2026" });
      await userEvent.click(screen.getByRole("button", { name: "Add time" }));
      await setTime("00:00");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(
        await screen.findByText("October 20, 2026, 12:00 AM"),
      ).toBeInTheDocument();
      expect(within(eventList()).getByText("RC1")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Our analytics events",
      );
      expect(writes()[1]).toEqual({
        method: "POST",
        path: "/api/timeline-event",
        body: expect.objectContaining({
          timezone: BROWSER_TIMEZONE,
          timestamp: "2026-10-20T00:00:00.000Z",
          time_matters: true,
        }),
      });
    });

    describe("moving an event", () => {
      const timelines = [
        releases(),
        createMockTimeline({ id: 3, name: "Metrics", collection_id: null }),
      ];
      const events = [
        event({ id: 4, name: "RC1", timeline_id: 2 }),
        event({ id: 5, name: "RC2", timeline_id: 3 }),
      ];

      async function moveRC2ToReleases() {
        const server = setup({
          initialRoute: "/collection/root/timelines",
          timelines,
          events,
        });
        await userEvent.click(await screen.findByText("Metrics"));
        await findHeading("Metrics");
        await openMenu("RC2", "Event menu");
        await clickMenuItem("Move event");
        await findHeading("Move RC2");
        await userEvent.click(screen.getByText("Releases"));
        await userEvent.click(screen.getByRole("button", { name: "Move" }));
        await findHeading("Metrics");
        expect(
          await screen.findByText("Add context to your time series charts"),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByText("RC2")).not.toBeInTheDocument(),
        );
        expect(server.writes()).toEqual([
          {
            method: "PUT",
            path: "/api/timeline-event/5",
            body: { timeline_id: 2 },
          },
        ]);
        return server;
      }

      it("moves an event to another timeline", async () => {
        await moveRC2ToReleases();

        await userEvent.click(screen.getByLabelText("chevronleft icon"));
        await userEvent.click(await screen.findByText("Releases"));
        await findHeading("Releases");
        expect(await screen.findByText("RC2")).toBeInTheDocument();
        expect(screen.getByText("RC1")).toBeInTheDocument();
      });

      it("moves an event back with undo", async () => {
        const { writes } = await moveRC2ToReleases();

        await userEvent.click(screen.getByRole("button", { name: "Undo" }));

        expect(await screen.findByText("RC2")).toBeInTheDocument();
        expect(writes()[1]).toEqual({
          method: "PUT",
          path: "/api/timeline-event/5",
          body: { timeline_id: 3 },
        });
      });
    });

    describe("archiving events", () => {
      const timelines = [releases()];
      const events = [
        event({ id: 4, name: "RC1", timestamp: "2026-01-01T00:00:00Z" }),
        event({ id: 5, name: "RC2", timestamp: "2026-02-01T00:00:00Z" }),
      ];

      it("archives an event from its edit form", async () => {
        const { writes, pathname } = setup({
          initialRoute: "/collection/root/timelines",
          timelines,
          events,
        });

        await findHeading("Releases");
        await openMenu("RC1", "Event menu");
        await clickMenuItem("Edit event");
        await userEvent.click(
          await screen.findByRole("button", { name: "Archive event" }),
        );

        await findHeading("Releases");
        expect(pathname()).toBe("/collection/root/timelines/2");
        expect(await screen.findByText("RC2")).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByText("RC1")).not.toBeInTheDocument(),
        );
        expect(writes()).toEqual([
          {
            method: "PUT",
            path: "/api/timeline-event/4",
            body: { archived: true },
          },
        ]);
      });

      it("archives an event from the timeline and undoes it", async () => {
        const { writes } = setup({
          initialRoute: "/collection/root/timelines",
          timelines,
          events,
        });

        await findHeading("Releases");
        await openMenu("RC1", "Event menu");
        await clickMenuItem("Archive event");

        expect(await screen.findByText("RC2")).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByText("RC1")).not.toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole("button", { name: "Undo" }));

        expect(await screen.findByText("RC1")).toBeInTheDocument();
        expect(writes()).toEqual([
          {
            method: "PUT",
            path: "/api/timeline-event/4",
            body: { archived: true },
          },
          {
            method: "PUT",
            path: "/api/timeline-event/4",
            body: { archived: false },
          },
        ]);
      });
    });

    describe("archived events", () => {
      const timelines = [releases()];
      const events = [
        event({
          id: 4,
          name: "RC1",
          archived: true,
          timestamp: "2026-01-01T00:00:00Z",
        }),
        event({
          id: 5,
          name: "RC2",
          archived: true,
          timestamp: "2026-02-01T00:00:00Z",
        }),
      ];

      async function openArchivedEvents() {
        const server = setup({
          initialRoute: "/collection/root/timelines",
          timelines,
          events,
        });
        await findHeading("Releases");
        await userEvent.click(
          screen.getByRole("button", { name: "Timeline menu" }),
        );
        await clickMenuItem("View archived events");
        await findHeading("Archived events");
        return server;
      }

      it("unarchives events and undoes it", async () => {
        const { writes } = await openArchivedEvents();

        await openMenu("RC2", "Event menu");
        await clickMenuItem("Unarchive event");
        expect(await screen.findByText("RC1")).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByText("RC2")).not.toBeInTheDocument(),
        );

        await userEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(await screen.findByText("RC2")).toBeInTheDocument();

        await openMenu("RC1", "Event menu");
        await clickMenuItem("Unarchive event");
        expect(await screen.findByText("RC2")).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByText("RC1")).not.toBeInTheDocument(),
        );
        await openMenu("RC2", "Event menu");
        await clickMenuItem("Unarchive event");
        expect(await screen.findByText("No events found")).toBeInTheDocument();

        expect(writes()).toEqual([
          {
            method: "PUT",
            path: "/api/timeline-event/5",
            body: { archived: false },
          },
          {
            method: "PUT",
            path: "/api/timeline-event/5",
            body: { archived: true },
          },
          {
            method: "PUT",
            path: "/api/timeline-event/4",
            body: { archived: false },
          },
          {
            method: "PUT",
            path: "/api/timeline-event/5",
            body: { archived: false },
          },
        ]);
      });

      it("deletes an archived event", async () => {
        const { writes, pathname } = await openArchivedEvents();

        await openMenu("RC2", "Event menu");
        await clickMenuItem("Delete event");
        await findHeading("Delete RC2?");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        await findHeading("Archived events");
        expect(pathname()).toBe("/collection/root/timelines/2/archive");
        expect(await screen.findByText("RC1")).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.queryByText("RC2")).not.toBeInTheDocument(),
        );
        expect(writes()).toEqual([
          { method: "DELETE", path: "/api/timeline-event/5", body: undefined },
        ]);
      });
    });

    it("searches events case-insensitively in a collection timeline", async () => {
      setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [
          event({ id: 4, name: "RC1" }),
          event({ id: 5, name: "RC2" }),
          event({ id: 6, name: "v1.0" }),
          event({ id: 7, name: "v1.1" }),
        ],
      });

      await userEvent.type(
        await screen.findByPlaceholderText("Search for an event"),
        "V1",
      );

      await waitFor(() =>
        expect(within(eventList()).queryByText("RC1")).not.toBeInTheDocument(),
      );
      expect(within(eventList()).queryByText("RC2")).not.toBeInTheDocument();
      expect(within(eventList()).getByText("v1.0")).toBeInTheDocument();
      expect(within(eventList()).getByText("v1.1")).toBeInTheDocument();
    });

    it("renders markdown in event descriptions", async () => {
      setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [
          event({
            id: 4,
            name: "RC1",
            description: "[Release notes](https://metabase.test)",
          }),
        ],
      });

      const link = await screen.findByText("Release notes");
      expect(link).toHaveAttribute("href", "https://metabase.test");
      expect(screen.queryByText(/\[Release notes\]/)).not.toBeInTheDocument();
    });

    it("uses the custom date style in the event form and list", async () => {
      const { writes } = setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [
          event({ id: 4, name: "RC0", timestamp: "2022-09-01T18:15:30Z" }),
          event({ id: 5, name: "RC1", timestamp: "2022-10-12T18:15:30Z" }),
        ],
        formattingSettings: { "type/Temporal": { date_style: "YYYY/M/D" } },
      });

      await findHeading("Releases");
      expect(screen.getByText("2022/9/1")).toBeInTheDocument();
      await openMenu("RC1", "Event menu");
      await clickMenuItem("Edit event");
      const dateInput = await screen.findByDisplayValue("2022/10/12");
      await userEvent.clear(dateInput);
      await userEvent.type(dateInput, "2022/10/15");
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      expect(await screen.findByText("2022/10/15")).toBeInTheDocument();
      expect(writes()).toEqual([
        {
          method: "PUT",
          path: "/api/timeline-event/5",
          body: expect.objectContaining({
            name: "RC1",
            // v65 sends a date-only event as the local midnight
            timestamp: dayjs("2022-10-15").toISOString(),
          }),
        },
      ]);
    });

    it("uses the custom time style in the event list", async () => {
      setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [
          event({
            id: 4,
            name: "RC1",
            timestamp: "2022-10-12T18:15:30Z",
            time_matters: true,
          }),
        ],
        formattingSettings: { "type/Temporal": { time_style: "HH:mm" } },
      });

      expect(
        await within(await screen.findByTestId("event-list")).findByText(
          "October 12, 2022, 18:15",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("timelines", () => {
    it("goes back from a timeline to the list of the collection's timelines", async () => {
      const { pathname } = setup({
        initialRoute: "/collection/root/timelines/3",
        timelines: [
          releases(),
          createMockTimeline({ id: 3, name: "Metrics", collection_id: null }),
        ],
      });

      await findHeading("Metrics");
      await userEvent.click(screen.getByLabelText("chevronleft icon"));

      await findHeading("Events");
      expect(pathname()).toBe("/collection/root/timelines");
      expect(screen.getByText("Releases")).toBeInTheDocument();
      expect(screen.getByText("Metrics")).toBeInTheDocument();
    });

    it("has no back button for a collection's only timeline", async () => {
      setup({
        initialRoute: "/collection/root/timelines/2",
        timelines: [releases()],
      });

      await findHeading("Releases");
      expect(
        screen.queryByLabelText("chevronleft icon"),
      ).not.toBeInTheDocument();
    });

    it("creates an additional timeline", async () => {
      const { writes, pathname } = setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [event({ id: 4, name: "RC1" })],
      });

      await findHeading("Releases");
      await userEvent.click(
        screen.getByRole("button", { name: "Timeline menu" }),
      );
      await clickMenuItem("New timeline");
      await userEvent.type(await screen.findByLabelText("Name"), "Launches");
      await userEvent.click(screen.getByLabelText("Default icon"));
      await userEvent.click(
        await screen.findByRole("option", { name: /Cake/ }),
      );
      expect(screen.getByLabelText("Default icon")).toHaveValue("Cake");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await findHeading("Launches");
      expect(pathname()).toBe("/collection/root/timelines/100");
      expect(
        screen.getByRole("button", { name: "Create event" }),
      ).toBeInTheDocument();
      expect(writes()).toEqual([
        {
          method: "POST",
          path: "/api/timeline",
          body: expect.objectContaining({
            name: "Launches",
            icon: "cake",
            collection_id: null,
            default: false,
          }),
        },
      ]);
    });

    it("edits a timeline", async () => {
      const { writes } = setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [event({ id: 4, name: "RC1" })],
      });

      await findHeading("Releases");
      await userEvent.click(
        screen.getByRole("button", { name: "Timeline menu" }),
      );
      await clickMenuItem("Edit timeline details");
      const nameInput = await screen.findByLabelText("Name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Launches");
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      await findHeading("Launches");
      expect(writes()).toEqual([
        {
          method: "PUT",
          path: "/api/timeline/2",
          body: expect.objectContaining({ name: "Launches", default: false }),
        },
      ]);
    });

    it("renders markdown in timeline descriptions", async () => {
      setup({
        initialRoute: "/collection/root/timelines",
        timelines: [
          releases({ description: "[Release notes](https://metabase.test)" }),
          createMockTimeline({
            id: 3,
            name: "Holidays",
            collection_id: null,
            description: "[Holiday list](https://metabase.test/holidays)",
          }),
        ],
      });

      expect(await screen.findByText("Release notes")).toHaveAttribute(
        "href",
        "https://metabase.test",
      );
      expect(screen.getByText("Holiday list")).toHaveAttribute(
        "href",
        "https://metabase.test/holidays",
      );
    });

    async function archiveReleases() {
      const server = setup({
        initialRoute: "/collection/root/timelines",
        timelines: [releases()],
        events: [
          event({ id: 4, name: "RC1", timestamp: "2026-01-01T00:00:00Z" }),
          event({ id: 5, name: "RC2", timestamp: "2026-02-01T00:00:00Z" }),
        ],
      });
      await findHeading("Releases");
      await userEvent.click(
        screen.getByRole("button", { name: "Timeline menu" }),
      );
      await clickMenuItem("Edit timeline details");
      await userEvent.click(
        await screen.findByRole("button", {
          name: "Archive timeline and all events",
        }),
      );
      await findHeading("Our analytics events");
      expect(server.writes()).toEqual([
        {
          method: "PUT",
          path: "/api/timeline/2",
          body: { archived: true, default: false },
        },
      ]);
      return server;
    }

    async function openArchivedTimelines() {
      await userEvent.click(
        screen.getByRole("button", { name: "Timelines menu" }),
      );
      await clickMenuItem("View archived timelines");
      await findHeading("Archived timelines");
    }

    it("archives a timeline and undoes it", async () => {
      const { writes, pathname } = await archiveReleases();

      expect(pathname()).toBe("/collection/root/timelines");
      expect(
        screen.getByRole("button", { name: "Create event" }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Undo" }));

      await findHeading("Releases");
      expect(await screen.findByText("RC1")).toBeInTheDocument();
      expect(screen.getByText("RC2")).toBeInTheDocument();
      expect(writes()[1]).toEqual({
        method: "PUT",
        path: "/api/timeline/2",
        body: { archived: false, default: false },
      });
    });

    it("unarchives a timeline", async () => {
      const { writes } = await archiveReleases();
      await openArchivedTimelines();

      await openMenu("Releases", "Timeline menu");
      await clickMenuItem("Unarchive timeline");

      expect(await screen.findByText("No timelines found")).toBeInTheDocument();
      expect(writes()[1]).toEqual({
        method: "PUT",
        path: "/api/timeline/2",
        body: { archived: false, default: false },
      });

      await userEvent.click(screen.getByLabelText("chevronleft icon"));
      await findHeading("Releases");
    });

    it("deletes an archived timeline", async () => {
      const { writes } = await archiveReleases();
      await openArchivedTimelines();

      await openMenu("Releases", "Timeline menu");
      await clickMenuItem("Delete timeline");
      await findHeading("Delete Releases?");
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("No timelines found")).toBeInTheDocument();
      expect(writes()[1]).toEqual({
        method: "DELETE",
        path: "/api/timeline/2",
        body: undefined,
      });

      await userEvent.click(screen.getByLabelText("chevronleft icon"));
      await findHeading("Our analytics events");
    });

    it("names a default timeline after its collection, also after a rename", async () => {
      const { writes, store, navigate } = setup({
        initialRoute: "/collection/9/timelines",
        collections: [ROOT, FIRST],
      });

      await findHeading("First collection events");
      await userEvent.click(
        screen.getByRole("button", { name: "Create event" }),
      );
      await fillEventForm({ name: "RC1", date: "10/20/2026" });
      await userEvent.click(screen.getByRole("button", { name: "Create" }));
      await screen.findByText("RC1");
      await findHeading("First collection events");
      expect(writes()[0]).toEqual({
        method: "POST",
        path: "/api/timeline",
        body: expect.objectContaining({
          name: "First collection events",
          collection_id: 9,
          default: true,
        }),
      });

      await userEvent.click(screen.getByLabelText("close icon"));
      await screen.findByText("Collection page");
      await act(() =>
        store.dispatch(
          collectionApi.endpoints.updateCollection.initiate({
            id: 9,
            name: "1st collection",
          }),
        ),
      );
      await navigate("/collection/9/timelines");

      await findHeading("1st collection events");
      await userEvent.click(
        screen.getByRole("button", { name: "Timeline menu" }),
      );
      await clickMenuItem("Edit timeline details");
      const nameInput = await screen.findByLabelText("Name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Releases");
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      await findHeading("Releases");
      expect(writes().at(-1)).toEqual({
        method: "PUT",
        path: "/api/timeline/100",
        body: expect.objectContaining({ name: "Releases", default: false }),
      });
    });
  });

  describe("permissions", () => {
    it.each([
      { canWrite: true, hasCreate: true },
      { canWrite: false, hasCreate: false },
    ])(
      "shows Create event in a collection without timelines when can_write is $canWrite",
      async ({ canWrite, hasCreate }) => {
        setup({
          initialRoute: "/collection/root/timelines",
          collections: [{ ...ROOT, can_write: canWrite }],
        });

        await findHeading("Our analytics events");
        expect(
          screen.queryByRole("button", { name: "Create event" }) != null,
        ).toBe(hasCreate);
        expect(
          screen.queryByRole("button", { name: "Timelines menu" }) != null,
        ).toBe(hasCreate);
      },
    );

    it.each([
      { canWrite: true, hasCreate: true },
      { canWrite: false, hasCreate: false },
    ])(
      "shows Create event in an existing timeline when can_write is $canWrite",
      async ({ canWrite, hasCreate }) => {
        setup({
          initialRoute: "/collection/root/timelines",
          collections: [{ ...ROOT, can_write: canWrite }],
          timelines: [releases()],
          events: [event({ id: 4, name: "RC1" })],
        });

        await findHeading("Releases");
        expect(screen.getByText("RC1")).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Create event" }) != null,
        ).toBe(hasCreate);
        expect(
          screen.queryByRole("button", { name: "Event menu" }) != null,
        ).toBe(hasCreate);
      },
    );
  });
});
