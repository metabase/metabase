import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderRoutes, screen, within } from "__support__/ui";
import type { Revision } from "metabase-types/api";
import {
  createMockDatabase,
  createMockRevision,
  createMockSegment,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { getReferenceRoutes } from "../routes";

const TABLE = createMockTable({ id: 10, db_id: 1 });

const DATABASE = createMockDatabase({ id: 1, tables: [TABLE] });

const SEGMENT = createMockSegment({
  id: 1,
  name: "Orders < 100",
  table_id: TABLE.id,
});

const ADMIN = createMockUser({ id: 3, is_superuser: true });

const REVISION_AUTHOR = {
  id: ADMIN.id,
  first_name: "Admin",
  last_name: "Test",
  common_name: "Admin Test",
};

// The API lists revisions newest first.
const REVISIONS: Revision[] = [
  createMockRevision({
    id: 2,
    is_creation: false,
    message: "Foo",
    user: REVISION_AUTHOR,
    diff: {
      description: {
        before: "All orders with a total under $100.",
        after: "Medium orders",
      },
    },
  }),
  createMockRevision({
    id: 1,
    is_creation: true,
    message: null,
    user: REVISION_AUTHOR,
    diff: {
      name: { after: SEGMENT.name },
      description: { after: "All orders with a total under $100." },
    },
  }),
];

interface SetupOpts {
  revisions?: Revision[];
}

function setup({ revisions = [] }: SetupOpts = {}) {
  setupSegmentsEndpoints([SEGMENT]);
  setupDatabaseEndpoints(DATABASE);
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);
  // Answers only the revisions of this segment.
  fetchMock.get("path:/api/revision", (call) => {
    const params = new URL(call.url).searchParams;
    return params.get("entity") === "segment" &&
      params.get("id") === String(SEGMENT.id)
      ? revisions
      : [];
  });

  // The reference route tree as the app mounts it.
  return renderRoutes(getReferenceRoutes(), {
    initialRoute: `/reference/segments/${SEGMENT.id}/revisions`,
    storeInitialState: createMockState({ currentUser: ADMIN }),
  });
}

describe("SegmentRevisionsContainer", () => {
  it("renders the revision history for the segment named by the route param", async () => {
    setup();

    expect(
      await screen.findAllByText("Revision history for Orders < 100"),
    ).not.toHaveLength(0);
  });

  it("lists the revisions newest first (metabase#45577)", async () => {
    setup({ revisions: REVISIONS });

    const page = await screen.findByTestId("segment-revisions");
    expect(
      await within(page).findByText("Revision history for Orders < 100"),
    ).toBeInTheDocument();

    const items = await within(page).findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("You edited the description");
    expect(items[0]).toHaveTextContent("Foo");
    expect(items[1]).toHaveTextContent('You created "Orders < 100"');
    expect(items[1]).toHaveTextContent("All orders with a total under $100.");
  });
});
