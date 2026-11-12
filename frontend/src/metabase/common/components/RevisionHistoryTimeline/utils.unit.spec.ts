import { createMockRevision, createMockUser } from "metabase-types/api/mocks";

import { getTimelineEvents } from "./utils";

const CURRENT_USER = createMockUser({ id: 1 });

const CREATED = createMockRevision({
  id: 1,
  description: "created this",
  timestamp: "2026-05-14T10:00:00Z",
  user: { id: 1, first_name: "Me", last_name: "Myself", common_name: "Me" },
});

const RENAMED = createMockRevision({
  id: 2,
  description: "renamed it",
  timestamp: "2026-05-16T10:00:00Z",
  is_creation: false,
  user: {
    id: 2,
    first_name: "Bobby",
    last_name: "Tables",
    common_name: "Bobby Tables",
  },
});

describe("getTimelineEvents", () => {
  it("names current user as You", () => {
    const events = getTimelineEvents({
      revisions: [RENAMED, CREATED],
      currentUser: CURRENT_USER,
    });

    expect(events.map((event) => event.title)).toEqual([
      "Bobby Tables renamed it",
      "You created this",
    ]);
  });
});
