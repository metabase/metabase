import React from "react";
import {
  REVISION_EVENT_ICON,
  getRevisionEventsForTimeline,
  getRevisionDescription,
  getChangedFields,
  isValidRevision,
} from "./revisions";
import { RevisionTitle } from "./components";

const DEFAULT_TIMESTAMP = "2016-05-08T02:02:07.441Z";
const DEFAULT_EPOCH_TIMESTAMP = new Date(DEFAULT_TIMESTAMP).valueOf();

function getRevision({
  isCreation = false,
  isReversion = false,
  userId = 1,
  username = "Foo",
  before,
  after,
  timestamp = DEFAULT_TIMESTAMP,
} = {}) {
  return {
    diff: {
      before,
      after,
    },
    user: {
      id: userId,
      common_name: username,
    },
    is_creation: isCreation,
    is_reversion: isReversion,
    timestamp,
  };
}

function getSimpleRevision({ field, before, after, ...rest }) {
  return getRevision({
    ...rest,
    before: {
      [field]: before,
    },
    after: {
      [field]: after,
    },
  });
}

describe("getRevisionDescription | common", () => {
  it("handles initial revision (entity created)", () => {
    const revision = getRevision({ isCreation: true });
    expect(getRevisionDescription(revision)).toBe("created this");
  });

  it("handles reversions", () => {
    const revision = getRevision({ isReversion: true });
    expect(getRevisionDescription(revision)).toBe(
      "reverted to an earlier revision",
    );
  });

  it("handles renames", () => {
    const revision = getSimpleRevision({
      field: "name",
      before: "Orders",
      after: "Orders by Month",
    });
    expect(getRevisionDescription(revision)).toBe(
      'renamed this to "Orders by Month"',
    );
  });

  it("handles description added", () => {
    const revision = getSimpleRevision({
      field: "description",
      before: null,
      after: "Hello there",
    });
    expect(getRevisionDescription(revision)).toBe("added a description");
  });

  it("handles description change", () => {
    const revision = getSimpleRevision({
      field: "description",
      before: "Hello",
      after: "Hello there",
    });
    expect(getRevisionDescription(revision)).toBe("changed the description");
  });

  it("handles archive revision", () => {
    const revision = getSimpleRevision({
      field: "archived",
      before: false,
      after: true,
    });
    expect(getRevisionDescription(revision)).toBe("archived this");
  });

  it("handles unarchive revision", () => {
    const revision = getSimpleRevision({
      field: "archived",
      before: true,
      after: false,
    });
    expect(getRevisionDescription(revision)).toBe("unarchived this");
  });

  it("returns an array of two changes", () => {
    const revision = getRevision({
      before: {
        name: "Orders",
        archived: true,
      },
      after: {
        name: "Orders by Month",
        archived: false,
      },
    });
    expect(getRevisionDescription(revision)).toEqual([
      'renamed this to "Orders by Month"',
      "unarchived this",
    ]);
  });

  it("returns an array of multiple changes", () => {
    const revision = getRevision({
      before: {
        name: "Orders",
        description: null,
        archived: true,
      },
      after: {
        name: "Orders by Month",
        description: "Test",
        archived: false,
      },
    });
    expect(getRevisionDescription(revision)).toEqual([
      'renamed this to "Orders by Month"',
      "added a description",
      "unarchived this",
    ]);
  });

  it("returns an empty array if can't find a friendly message", () => {
    const revision = getSimpleRevision({
      field: "some_field",
      before: 1,
      after: 2,
    });
    expect(getRevisionDescription(revision)).toEqual([]);
  });

  it("filters out unknown change types", () => {
    const revision = getRevision({
      before: {
        description: null,
        archived: null,
      },
      after: {
        description: "Test",
        archived: false,
      },
    });
    expect(getRevisionDescription(revision)).toBe("added a description");
  });

  it("filters out messages for unknown fields from a complex diff", () => {
    const revision = getRevision({
      before: {
        some_field: 1,
        name: "orders",
      },
      after: {
        some_field: 2,
        name: "Orders",
      },
    });
    expect(getRevisionDescription(revision)).toBe('renamed this to "Orders"');
  });

  it("prefers 'after' state to find changed fields", () => {
    const revision = getRevision({
      before: {
        display: "table",
      },
      after: {
        display: "bar",
        visualization_settings: { "some-flag": true },
        dataset_query: {},
      },
    });
    expect(getRevisionDescription(revision)).toEqual([
      "changed the display from table to bar",
      "changed the visualization settings",
      "edited the question",
    ]);
  });
});

describe("getRevisionDescription | questions", () => {
  it("handles query change revision", () => {
    const revision = getSimpleRevision({
      field: "dataset_query",
      before: { "source-table": 1 },
      after: { "source-table": 2 },
    });

    expect(getRevisionDescription(revision)).toBe("edited the question");
  });

  it("handles query change revision when before state is null", () => {
    const revision = getSimpleRevision({
      field: "dataset_query",
      before: null,
      after: { "source-table": 2 },
    });

    expect(getRevisionDescription(revision)).toBe("edited the question");
  });

  it("handles added visualization settings revision", () => {
    const revision = getSimpleRevision({
      field: "visualization_settings",
      before: null,
      after: { "table.pivot": true },
    });

    expect(getRevisionDescription(revision)).toBe(
      "changed the visualization settings",
    );
  });

  it("handles visualization settings changes revision", () => {
    const revision = getSimpleRevision({
      field: "visualization_settings",
      before: {},
      after: { "table.pivot": true },
    });

    expect(getRevisionDescription(revision)).toBe(
      "changed the visualization settings",
    );
  });

  it("handles removed visualization settings revision", () => {
    const revision = getSimpleRevision({
      field: "visualization_settings",
      before: { "table.pivot": true },
      after: null,
    });

    expect(getRevisionDescription(revision)).toBe(
      "changed the visualization settings",
    );
  });

  it("handles turning a question into a model", () => {
    const revision = getSimpleRevision({
      field: "dataset",
      before: false,
      after: true,
    });

    expect(getRevisionDescription(revision)).toBe("turned this into a model");
  });

  it("handles turning a model back into a saved question", () => {
    const revision = getSimpleRevision({
      field: "dataset",
      before: true,
      after: false,
    });

    expect(getRevisionDescription(revision)).toBe(
      "changed this from a model to a saved question",
    );
  });

  it("handles metadata changes for models", () => {
    const revision = getSimpleRevision({
      field: "result_metadata",
      before: [{ foo: "" }],
      after: [{ foo: "bar" }],
    });

    expect(getRevisionDescription(revision)).toBe("edited the metadata");
  });
});

describe("getRevisionDescription | dashboards", () => {
  it("handles added card revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ id: 1 }, { id: 2 }],
      after: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    expect(getRevisionDescription(revision)).toBe("added a card");
  });

  it("handles added multiple cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ id: 1 }, { id: 2 }],
      after: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
    });
    expect(getRevisionDescription(revision)).toBe("added 3 cards");
  });

  it("filters null card values for new card revision", () => {
    const revision = getRevision({
      before: null,
      after: {
        cards: [null, null, { id: 1 }],
      },
    });
    expect(getRevisionDescription(revision)).toBe("added a card");
  });

  it("handles first card added revision", () => {
    const revision = getRevision({
      before: null,
      after: {
        cards: [{ id: 1 }],
      },
    });
    expect(getRevisionDescription(revision)).toBe("added a card");
  });

  it("handles removed card revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ id: 1 }, { id: 2 }],
      after: [{ id: 1 }],
    });
    expect(getRevisionDescription(revision)).toBe("removed a card");
  });

  it("filters null card values for removed card revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [null, { id: 1 }, { id: 2 }],
      after: [null, { id: 1 }],
    });
    expect(getRevisionDescription(revision)).toBe("removed a card");
  });

  it("handles removed cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ id: 1 }, { id: 2 }, { id: 3 }],
      after: [{ id: 1 }],
    });
    expect(getRevisionDescription(revision)).toBe("removed 2 cards");
  });

  it("handles all cards removed revision", () => {
    const revision = getRevision({
      before: {
        cards: [{ id: 1 }, { id: 2 }, { id: 3 }],
      },
      after: null,
    });
    expect(getRevisionDescription(revision)).toBe("removed 3 cards");
  });

  it("handles rearranged cards revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ id: 1 }, { id: 2 }, { id: 3 }],
      after: [{ id: 2 }, { id: 1 }, { id: 3 }],
    });
    expect(getRevisionDescription(revision)).toBe("rearranged the cards");
  });

  it("handles added series revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ series: null }],
      after: [{ series: [4] }],
    });
    expect(getRevisionDescription(revision)).toBe("added series to a question");
  });

  it("handles removed series revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ series: [4] }],
      after: [{ series: null }],
    });
    expect(getRevisionDescription(revision)).toBe(
      "removed series from a question",
    );
  });

  it("handles modified series revision", () => {
    const revision = getSimpleRevision({
      field: "cards",
      before: [{ series: [4, 5] }],
      after: [{ series: [5, 4] }],
    });
    expect(getRevisionDescription(revision)).toBe("modified question's series");
  });
});

describe("getRevisionEvents", () => {
  const latestRevisionEvent = getRevision({
    isReversion: true,
    description: "bar",
    username: "Bar",
  });

  const changeEvent = getRevision({
    before: {
      description: null,
    },
    after: {
      description: "some description is now here",
    },
  });

  const creationEvent = getRevision({
    isCreation: true,
    description: "foo",
  });

  function getExpectedEvent(opts) {
    return {
      timestamp: DEFAULT_EPOCH_TIMESTAMP,
      icon: REVISION_EVENT_ICON,
      ...opts,
    };
  }

  const revisionEvents = [latestRevisionEvent, changeEvent, creationEvent];

  it("should convert a revision object into an object for use in a <Timeline /> component", () => {
    const timelineEvents = getRevisionEventsForTimeline(revisionEvents, {
      canWrite: false,
    });

    expect(timelineEvents).toEqual([
      getExpectedEvent({
        title: (
          <RevisionTitle
            username="Bar"
            message="reverted to an earlier revision"
          />
        ),
        titleText: "Bar reverted to an earlier revision",
        isRevertable: false,
        revision: latestRevisionEvent,
      }),
      getExpectedEvent({
        title: <RevisionTitle username="Foo" message="added a description" />,
        titleText: "Foo added a description",
        isRevertable: false,
        revision: changeEvent,
      }),
      getExpectedEvent({
        title: <RevisionTitle username="Foo" message="created this" />,
        titleText: "Foo created this",
        isRevertable: false,
        revision: creationEvent,
      }),
    ]);
  });

  it("should set the `isRevertable` to false when the user doesn't have write access", () => {
    const timelineEvents = getRevisionEventsForTimeline(revisionEvents, {
      canWrite: false,
    });

    expect(timelineEvents.every(event => event.isRevertable)).toBe(false);
  });

  it("should set the `isRevertable` to true on all revisions that are not the most recent revision when the user has write access", () => {
    const timelineEvents = getRevisionEventsForTimeline(revisionEvents, {
      canWrite: true,
    });

    expect(timelineEvents[0].isRevertable).toBe(false);
    expect(timelineEvents[1].isRevertable).toBe(true);
  });

  it("should drop invalid revisions", () => {
    const timelineEvents = getRevisionEventsForTimeline(
      [
        changeEvent,
        getRevision({
          before: null,
          after: null,
        }),
      ],
      { canWrite: true },
    );
    expect(timelineEvents).toEqual([
      getExpectedEvent({
        title: <RevisionTitle username="Foo" message="added a description" />,
        titleText: "Foo added a description",
        isRevertable: false,
        revision: changeEvent,
      }),
    ]);
  });

  it("should drop revisions with not registered fields", () => {
    const timelineEvents = getRevisionEventsForTimeline(
      [
        changeEvent,
        getRevision({
          before: {
            "dont-know-this-field": 1,
          },
          after: { "dont-know-this-field": 2 },
        }),
      ],
      { canWrite: true },
    );
    expect(timelineEvents).toEqual([
      getExpectedEvent({
        title: <RevisionTitle username="Foo" message="added a description" />,
        titleText: "Foo added a description",
        isRevertable: false,
        revision: changeEvent,
      }),
    ]);
  });

  it("should use 'You' instead of a username if it's current user", () => {
    const currentUser = { id: 5 };
    const event = getRevision({
      isCreation: true,
      userId: currentUser.id,
    });
    const timelineEvents = getRevisionEventsForTimeline([event], {
      currentUser,
    });

    expect(timelineEvents).toEqual([
      getExpectedEvent({
        title: <RevisionTitle username="You" message="created this" />,
        titleText: "You created this",
        isRevertable: false,
        revision: event,
      }),
    ]);
  });
});

describe("isValidRevision", () => {
  it("returns false if there is no diff and it's not creation or reversion action", () => {
    const revision = getRevision({
      isCreation: false,
      isReversion: false,
      before: null,
      after: null,
    });
    expect(isValidRevision(revision)).toBe(false);
  });

  it("returns false if diff contains only unknown fields", () => {
    const revision = getRevision({
      before: {
        not_registered_field: 1,
      },
      after: {
        not_registered_field: 2,
      },
    });
    expect(isValidRevision(revision)).toBe(false);
  });

  it("returns true for creation revision", () => {
    const revision = getRevision({
      isCreation: true,
      isReversion: false,
      before: null,
      after: null,
    });
    expect(isValidRevision(revision)).toBe(true);
  });

  it("returns true for reversion revision", () => {
    const revision = getRevision({
      isCreation: false,
      isReversion: true,
      before: null,
      after: null,
    });
    expect(isValidRevision(revision)).toBe(true);
  });

  it("returns true for change revision", () => {
    const revision = getSimpleRevision({
      field: "name",
      before: "orders",
      after: "Orders",
    });
    expect(isValidRevision(revision)).toBe(true);
  });

  it("returns true if 'before' state is null, but 'after' state is present", () => {
    const revision = getRevision({
      before: null,
      after: {
        cards: [1],
      },
    });
    expect(isValidRevision(revision)).toBe(true);
  });

  it("returns true if 'after' state is null, but 'before' state is present", () => {
    const revision = getRevision({
      before: {
        cards: [1],
      },
      after: null,
    });
    expect(isValidRevision(revision)).toBe(true);
  });
});

describe("getChangedFields", () => {
  it("returns a list of changed fields", () => {
    const revision = getRevision({
      before: {
        name: "Orders",
        description: null,
      },
      after: {
        name: "Orders by Month",
        description: "Hello",
      },
    });
    expect(getChangedFields(revision)).toEqual(["name", "description"]);
  });

  it("returns a list of changed fields if 'before' state is null", () => {
    const revision = getRevision({
      before: null,
      after: {
        cards: [1],
      },
    });
    expect(getChangedFields(revision)).toEqual(["cards"]);
  });

  it("returns a list of changed fields if 'after' state is null", () => {
    const revision = getRevision({
      before: {
        cards: [1],
      },
      after: null,
    });
    expect(getChangedFields(revision)).toEqual(["cards"]);
  });

  it("returns a list with a single changed field", () => {
    const revision = getRevision({
      before: {
        description: null,
      },
      after: {
        description: "Hello",
      },
    });
    expect(getChangedFields(revision)).toEqual(["description"]);
  });

  it("filters out unknown fields", () => {
    const revision = getRevision({
      before: {
        dont_know_this_field: null,
      },
      after: {
        dont_know_this_field: "Hello",
      },
    });
    expect(getChangedFields(revision)).toEqual([]);
  });

  it("returns empty array if diff is missing", () => {
    const revision = {
      diff: null,
    };
    expect(getChangedFields(revision)).toEqual([]);
  });

  it("returns empty array if 'before' and 'after' states missing", () => {
    const revision = getRevision({
      before: null,
      after: null,
    });
    expect(getChangedFields(revision)).toEqual([]);
  });
});
