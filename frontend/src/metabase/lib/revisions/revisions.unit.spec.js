import React from "react";
import {
  REVISION_EVENT_ICON,
  getRevisionEventsForTimeline,
} from "metabase/lib/revisions";
import { RevisionTitle } from "./components";

describe("revisions", () => {
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
          title: (
            <RevisionTitle
              username="Bar"
              message="reverted to an earlier revision"
            />
          ),
          isRevertable: false,
          revision: latestRevisionEvent,
        }),
        getExpectedEvent({
          title: <RevisionTitle username="Foo" message="added a description" />,
          isRevertable: false,
          revision: changeEvent,
        }),
        getExpectedEvent({
          title: <RevisionTitle username="Foo" message="created this" />,
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
          title: <RevisionTitle username="Foo" message="added a description" />,
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
          title: <RevisionTitle username="Foo" message="added a description" />,
          isRevertable: false,
          revision: changeEvent,
        }),
      ]);
    });
  });
});
