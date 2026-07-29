import { createMockRevision } from "metabase-types/api/mocks/revision";
import { createMockUser } from "metabase-types/api/mocks/user";

import { getTimelineEvents } from "./utils";

describe("getTimelineEvents", () => {
  it("uses the revision's user name in the title", () => {
    const currentUser = createMockUser({ id: 99 });
    const revision = createMockRevision({
      user: {
        id: 1,
        first_name: "Ash",
        last_name: "Ketchum",
        common_name: "Ash Ketchum",
      },
      description: "added a description",
      has_multiple_changes: false,
    });

    const [event] = getTimelineEvents({ revisions: [revision], currentUser });

    expect(event.title).toEqual("Ash Ketchum added a description");
  });

  it("uses 'You' for the current user", () => {
    const currentUser = createMockUser({ id: 1 });
    const revision = createMockRevision({
      user: {
        id: 1,
        first_name: "Ash",
        last_name: "Ketchum",
        common_name: "Ash Ketchum",
      },
      description: "added a description",
    });

    const [event] = getTimelineEvents({ revisions: [revision], currentUser });

    expect(event.title).toEqual("You added a description");
  });

  it("falls back instead of rendering a literal 'undefined' when the revision has no user (metabase#77942)", () => {
    const currentUser = createMockUser({ id: 99 });
    // Seeded example content and revisions from since-deleted users can come
    // back with an empty user map.
    const revision = createMockRevision({
      // Unjustified type cast. FIXME
      user: {} as ReturnType<typeof createMockRevision>["user"],
      description: "added a description",
    });

    const [event] = getTimelineEvents({ revisions: [revision], currentUser });

    expect(event.title).toEqual("Unknown added a description");
  });
});
