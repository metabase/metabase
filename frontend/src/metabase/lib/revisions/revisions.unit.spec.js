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

    function getRevision({
      isReversion = false,
      isCreation = false,
      userName = "Foo",
      ...rest
    } = {}) {
      return {
        is_reversion: isReversion,
        is_creation: isCreation,
        user: {
          common_name: userName,
        },
        timestamp,
        ...rest,
      };
    }

    const latestRevisionEvent = getRevision({
      isReversion: true,
      description: "bar",
      userName: "Bar",
    });

    const changeEvent = getRevision({
      diff: {
        before: {
          description: null,
        },
        after: {
          description: "some description is now here",
        },
      },
    });

    const creationEvent = getRevision({
      isCreation: true,
      description: "foo",
    });

    function getExpectedEvent(opts) {
      return {
        description: undefined,
        timestamp: epochTimestamp,
        icon: REVISION_EVENT_ICON,
        ...opts,
      };
    }

    const revisionEvents = [latestRevisionEvent, changeEvent, creationEvent];

    it("should convert a revision object into an object for use in a <Timeline /> component", () => {
      const canWrite = false;
      const timelineEvents = getRevisionEventsForTimeline(
        revisionEvents,
        canWrite,
      );

      expect(timelineEvents).toEqual([
        getExpectedEvent({
          title: "Bar reverted to an earlier revision",
          isRevertable: false,
          revision: latestRevisionEvent,
        }),
        getExpectedEvent({
          title: "Foo added a description",
          isRevertable: false,
          revision: changeEvent,
        }),
        getExpectedEvent({
          title: "Foo created this",
          isRevertable: false,
          revision: creationEvent,
        }),
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

    it("should capitalize descriptions", () => {
      const [event] = getRevisionEventsForTimeline([
        getRevision({
          diff: {
            before: {
              description: null,
              archived: true,
            },
            after: {
              description: "Please do not archive this anymore",
              archived: false,
            },
          },
        }),
      ]);

      expect(event.description).toBe("Added a description and unarchived this");
    });

    it("should drop invalid revisions", () => {
      const canWrite = true;
      const timelineEvents = getRevisionEventsForTimeline(
        [
          changeEvent,
          getRevision({
            diff: { before: null, after: null },
          }),
        ],
        canWrite,
      );
      expect(timelineEvents).toEqual([
        getExpectedEvent({
          title: "Foo added a description",
          isRevertable: false,
          revision: changeEvent,
        }),
      ]);
    });

    it("should drop revisions with not registered fields", () => {
      const canWrite = true;
      const timelineEvents = getRevisionEventsForTimeline(
        [
          changeEvent,
          getRevision({
            diff: {
              before: {
                "dont-know-this-field": 1,
              },
              after: { "dont-know-this-field": 2 },
            },
          }),
        ],
        canWrite,
      );
      expect(timelineEvents).toEqual([
        getExpectedEvent({
          title: "Foo added a description",
          isRevertable: false,
          revision: changeEvent,
        }),
      ]);
    });
  });
});
