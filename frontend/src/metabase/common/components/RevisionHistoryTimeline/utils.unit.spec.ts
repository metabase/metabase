import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import {
  createMockModerationReview,
  createMockRevision,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { getActivityTimelineEvents } from "./utils";

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

const VERIFIED = createMockModerationReview({
  created_at: "2026-05-15T10:00:00Z",
});

describe("getActivityTimelineEvents", () => {
  beforeEach(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({ content_verification: true }),
    });
    setupEnterpriseOnlyPlugin("moderation");
  });

  it("merges revisions and moderation reviews newest first", () => {
    const events = getActivityTimelineEvents({
      revisions: [CREATED, RENAMED],
      moderationReviews: [VERIFIED],
      currentUser: CURRENT_USER,
    });

    expect(events.map((event) => event.title)).toEqual([
      "Bobby Tables renamed it",
      expect.stringContaining("verified this"),
      "You created this",
    ]);
  });

  it("lists revisions alone when there are no reviews", () => {
    const events = getActivityTimelineEvents({
      revisions: [CREATED],
      currentUser: CURRENT_USER,
    });

    expect(events.map((event) => event.title)).toEqual(["You created this"]);
  });
});
