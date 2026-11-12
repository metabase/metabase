import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route, useParams } from "metabase/router";
import type { EnterpriseSettings, Revision, Segment } from "metabase-types/api";
import {
  createMockRevision,
  createMockSegment,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  createOrdersTable,
  createPeopleTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { RevisionHistoryApp } from "./RevisionHistoryApp";
import { SegmentListApp } from "./SegmentListApp";

const SEGMENTS_URL = "/admin/datamodel/segments";

const ADMIN = createMockUser({ id: 1, is_superuser: true });

const ORDERS_SEGMENT = createMockSegment({
  id: 1,
  name: "Orders < 100",
  description: "All orders with a total under $100.",
  table_id: ORDERS_ID,
  definition_description: "Filtered by Total is less than 100",
});

const PEOPLE_SEGMENT = createMockSegment({
  id: 2,
  name: "People from Twitter",
  description: "People who signed up from Twitter",
  table_id: PEOPLE_ID,
  definition_description: "Filtered by Source is Twitter",
});

const REVISION_AUTHOR = {
  id: ADMIN.id,
  first_name: "Admin",
  last_name: "Test",
  common_name: "Admin Test",
};

// The API lists revisions newest first.
const ORDERS_SEGMENT_REVISIONS: Revision[] = [
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
      name: { after: ORDERS_SEGMENT.name },
      description: { after: "All orders with a total under $100." },
      definition: {
        after: {
          "source-table": ORDERS_ID,
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      },
    },
  }),
];

function CreatePage() {
  return <div>New segment page</div>;
}

function EditPage() {
  const { id } = useParams<{ id: string }>();
  return <div>{`Edit page for segment ${id}`}</div>;
}

interface SetupOpts {
  segments?: Segment[];
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
  initialRoute?: string;
}

function setup({
  segments = [ORDERS_SEGMENT, PEOPLE_SEGMENT],
  remoteSyncType,
  initialRoute = SEGMENTS_URL,
}: SetupOpts = {}) {
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");

  setupDatabasesEndpoints([
    createSampleDatabase({
      tables: [
        createOrdersTable({ is_published: true }),
        createPeopleTable({ is_published: false }),
      ],
    }),
  ]);
  setupSegmentsEndpoints(segments);
  // Answers only the revisions of the Orders segment.
  fetchMock.get("path:/api/revision", (call) => {
    const params = new URL(call.url).searchParams;
    return params.get("entity") === "segment" &&
      params.get("id") === String(ORDERS_SEGMENT.id)
      ? ORDERS_SEGMENT_REVISIONS
      : [];
  });

  if (remoteSyncType) {
    setupEnterpriseOnlyPlugin("remote_sync");
  }

  renderWithProviders(
    <>
      <Route path={SEGMENTS_URL} element={<SegmentListApp />} />
      <Route path="/admin/datamodel/segment/create" element={<CreatePage />} />
      <Route path="/admin/datamodel/segment/:id" element={<EditPage />} />
      <Route
        path="/admin/datamodel/segment/:id/revisions"
        element={<RevisionHistoryApp />}
      />
    </>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: ADMIN,
        settings: mockSettings({
          "token-features": createMockTokenFeatures({
            remote_sync: !!remoteSyncType,
          }),
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      }),
    },
  );

  return { trackSimpleEvent };
}

function findSegmentRow(name: string) {
  return screen.findByRole("row", { name: new RegExp(name) });
}

async function openActionMenu(name: string) {
  const row = await findSegmentRow(name);
  await userEvent.click(within(row).getByRole("button", { name: /ellipsis/ }));
}

describe("SegmentListApp", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("explains how to add segments when there are none", async () => {
    setup({ segments: [] });

    expect(
      await screen.findByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      ),
    ).toBeInTheDocument();
  });

  it("lists each segment with its table and definition", async () => {
    setup();

    const row = await findSegmentRow(PEOPLE_SEGMENT.name);
    expect(
      within(row).getByRole("link", { name: /People from Twitter/ }),
    ).toHaveAttribute("href", `/admin/datamodel/segment/${PEOPLE_SEGMENT.id}`);
    expect(await within(row).findByText("Sample Database")).toBeInTheDocument();
    expect(within(row).getByText("People")).toBeInTheDocument();
    expect(
      within(row).getByText("Filtered by Source is Twitter"),
    ).toBeInTheDocument();
    expect(
      within(row).queryByText("Filtered by Total is less than 100"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      ),
    ).not.toBeInTheDocument();
  });

  it("opens the edit page of the clicked segment", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("link", { name: /People from Twitter/ }),
    );

    expect(
      await screen.findByText(`Edit page for segment ${PEOPLE_SEGMENT.id}`),
    ).toBeInTheDocument();
  });

  it("tracks the start of a new segment", async () => {
    const { trackSimpleEvent } = setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "New segment" }),
    );

    expect(await screen.findByText("New segment page")).toBeInTheDocument();
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "segment_create_started",
      triggered_from: "admin_datamodel_segments",
      target_id: null,
    });
  });

  describe("read-only remote sync", () => {
    it("offers the write actions for a segment of an unpublished table", async () => {
      setup({ remoteSyncType: "read-only" });

      await openActionMenu(PEOPLE_SEGMENT.name);

      expect(
        await screen.findByRole("menuitem", { name: "Edit Segment" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Retire Segment" }),
      ).toBeInTheDocument();
    });

    it("hides the write actions for a segment of a published table", async () => {
      setup({ remoteSyncType: "read-only" });

      await openActionMenu(ORDERS_SEGMENT.name);

      expect(
        await screen.findByRole("menuitem", { name: "Revision History" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Edit Segment" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Retire Segment" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("revision history", () => {
    it("opens the revision history of the segment from its menu", async () => {
      setup();

      await openActionMenu(ORDERS_SEGMENT.name);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Revision History" }),
      );

      const revisions = await screen.findByTestId("segment-revisions");
      expect(
        within(revisions).getByRole("heading", {
          name: `Revision History for "${ORDERS_SEGMENT.name}"`,
        }),
      ).toBeInTheDocument();

      const items = within(revisions).getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("You edited the description");
      expect(items[0]).toHaveTextContent("Foo");
      expect(items[1]).toHaveTextContent(
        `You created "${ORDERS_SEGMENT.name}"`,
      );
      expect(items[1]).toHaveTextContent("All orders with a total under $100.");

      const [revisionsCall] = fetchMock.callHistory.calls("path:/api/revision");
      const params = new URL(revisionsCall.url).searchParams;
      expect(params.get("entity")).toBe("segment");
      expect(params.get("id")).toBe(String(ORDERS_SEGMENT.id));
    });

    it("links back to the segments of the same table", async () => {
      setup({
        initialRoute: `/admin/datamodel/segment/${ORDERS_SEGMENT.id}/revisions`,
      });

      expect(await screen.findByText("Segment History")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("link", { name: "Segments" }));

      expect(
        await screen.findByRole("link", { name: /Orders < 100/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /People from Twitter/ }),
      ).not.toBeInTheDocument();
    });
  });
});
