import {
  REVISION_EVENT_ICON,
  getRevisionDescription,
  getRevisionEventsForTimeline,
} from "metabase/lib/revisions";

describe("revisions", () => {
  describe("getRevisionDescription", () => {
    it("should return the description for a creation event", () => {
      const description = getRevisionDescription({
        is_creation: true,
      });

      expect(description).toEqual("First revision.");
    });

    it("should return the description for a revision event", () => {
      const description = getRevisionDescription({
        is_reversion: true,
        description: "foo",
      });

      expect(description).toEqual("Reverted to an earlier revision and foo");
    });

    it("should return the description for other revision events", () => {
      const description = getRevisionDescription({
        description: "foo",
      });

      expect(description).toEqual("foo");
    });
  });

  describe("getRevisionEvents", () => {
    const timestamp = "2016-05-08T02:02:07.441Z";
    const epochTimestamp = new Date(timestamp).valueOf();

    const latestRevisionEvent = {
      is_reversion: true,
      description: "bar",
      timestamp,
      user: {
        common_name: "Bar",
      },
    };

    const creationEvent = {
      is_creation: true,
      description: "foo",
      timestamp,
      user: {
        common_name: "Foo",
      },
    };

    const revisionEvents = [latestRevisionEvent, creationEvent];

    it("should convert a revision object into an object for use in a <Timeline /> component", () => {
      const canWrite = false;
      const timelineEvents = getRevisionEventsForTimeline(
        revisionEvents,
        canWrite,
      );

      expect(timelineEvents).toEqual([
        {
          timestamp: epochTimestamp,
          icon: REVISION_EVENT_ICON,
          title: "Bar edited this",
          description: getRevisionDescription(latestRevisionEvent),
          isRevertable: false,
          revision: latestRevisionEvent,
        },
        {
          timestamp: epochTimestamp,
          icon: REVISION_EVENT_ICON,
          title: "Foo created this",
          description: undefined,
          isRevertable: false,
          revision: creationEvent,
        },
      ]);
    });

    it("should set the `isRevertable` to false when the user doesn't have write access", () => {
      const canWrite = false;
      const timelineEvents = getRevisionEventsForTimeline(
        revisionEvents,
        canWrite,
      );

      expect(timelineEvents.every(event => event.isRevertable)).toBe(false);
    });

    it("should set the `isRevertable` to true on all revisions that are not the most recent revision when the user has write access", () => {
      const canWrite = true;
      const timelineEvents = getRevisionEventsForTimeline(
        revisionEvents,
        canWrite,
      );

      expect(timelineEvents[0].isRevertable).toBe(false);
      expect(timelineEvents[1].isRevertable).toBe(true);
    });
  });
});
