import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetSegmentTestEndpoint,
  setupRunSegmentTestEndpoint,
  setupSchemaEndpoints,
  setupSegmentEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { SegmentTest } from "metabase-types/api";
import {
  createMockCollection,
  createMockDataTestEmptyExpectation,
  createMockDataTestEqualsExpectation,
  createMockDataTestRowsData,
  createMockDataTestRun,
  createMockDatabase,
  createMockSegment,
  createMockSegmentTest,
  createMockTable,
} from "metabase-types/api/mocks";

import { SegmentTestOverviewPage } from "./SegmentTestOverviewPage";

const DATABASE_ID = 1;
const TABLE_ID = 42;
const SEGMENT_ID = 7;
const TEST_ID = 2;
const DATA_MODEL_PARAMS = {
  databaseId: DATABASE_ID,
  schemaName: "PUBLIC",
  tableId: TABLE_ID,
  segmentId: SEGMENT_ID,
};

type SetupOpts = {
  test?: SegmentTest;
  canRunNativeQueries?: boolean;
  location?: "published-table" | "data-model";
};

function setup({
  test = createMockSegmentTest({
    id: TEST_ID,
    segment_id: SEGMENT_ID,
    name: "Refunds are excluded",
  }),
  canRunNativeQueries = true,
  location = "published-table",
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const database = createMockDatabase({
    id: DATABASE_ID,
    name: "Warehouse",
    native_permissions: canRunNativeQueries ? "write" : "none",
  });
  setupDatabasesEndpoints([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupSchemaEndpoints(database);
  setupTableEndpoints(
    createMockTable({
      id: TABLE_ID,
      db_id: DATABASE_ID,
      db: database,
      schema: "PUBLIC",
      display_name: "Orders",
    }),
  );
  setupSegmentEndpoint(
    createMockSegment({
      id: SEGMENT_ID,
      name: "Paid orders",
      table_id: TABLE_ID,
    }),
  );
  setupGetSegmentTestEndpoint(test);
  setupRunSegmentTestEndpoint(test.id, {
    status: "passed",
    expectations: [],
    tables: {},
  });

  renderWithProviders(
    <>
      <Route
        path="/data-studio/library/tables/:tableId/segments/:segmentId/tests/:testId"
        element={<SegmentTestOverviewPage />}
      />
      <Route
        path="/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/tests/:testId"
        element={<SegmentTestOverviewPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute:
        location === "data-model"
          ? Urls.dataStudioDataModelSegmentTest(DATA_MODEL_PARAMS, test.id)
          : Urls.dataStudioPublishedTableSegmentTest(
              TABLE_ID,
              SEGMENT_ID,
              test.id,
            ),
    },
  );
}

describe("SegmentTestOverviewPage", () => {
  it("shows the test name with breadcrumbs back to the segment tests and the table segments", async () => {
    setup();

    expect(await screen.findAllByText("Refunds are excluded")).toHaveLength(2);
    expect(
      await screen.findByRole("link", { name: "Paid orders" }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioPublishedTableSegmentTestList(TABLE_ID, SEGMENT_ID),
    );
    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
      "href",
      Urls.dataStudioTableSegments(TABLE_ID),
    );
  });

  it("shows data model breadcrumbs for a data model segment test", async () => {
    setup({ location: "data-model" });

    expect(
      await screen.findByRole("link", { name: "Paid orders" }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioDataModelSegmentTestList(DATA_MODEL_PARAMS),
    );
    expect(screen.getByRole("link", { name: "Warehouse" })).toHaveAttribute(
      "href",
      Urls.dataStudioData({ databaseId: DATABASE_ID }),
    );
    expect(screen.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "href",
      Urls.dataStudioDataModelSegmentTestRuns(DATA_MODEL_PARAMS, TEST_ID),
    );
  });

  it("says when the test has never run", async () => {
    setup();

    expect(
      await screen.findByText("This test hasn't been run before."),
    ).toBeInTheDocument();
  });

  it("shows a failed last run as failed and links to all runs", async () => {
    setup({
      test: createMockSegmentTest({
        id: TEST_ID,
        segment_id: SEGMENT_ID,
        last_run: createMockDataTestRun({
          test_type: "segment",
          status: "failed",
        }),
      }),
    });

    const runsUrl = Urls.dataStudioPublishedTableSegmentTestRuns(
      TABLE_ID,
      SEGMENT_ID,
      TEST_ID,
    );
    expect(await screen.findByText(/Last run failed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all runs" })).toHaveAttribute(
      "href",
      runsUrl,
    );
    expect(screen.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "href",
      runsUrl,
    );
  });

  it("runs the test and reloads it", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: /Run now/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/segment-test/${TEST_ID}/run`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/ee/segment-test/${TEST_ID}`),
      ).toHaveLength(2);
    });
  });

  it("disables running for users who can't run native queries on the database", async () => {
    setup({ canRunNativeQueries: false });

    expect(
      await screen.findByRole("button", { name: /Run now/ }),
    ).toBeDisabled();
  });

  it("shows the rows that stand in for the input tables", async () => {
    setup({
      test: createMockSegmentTest({
        id: TEST_ID,
        segment_id: SEGMENT_ID,
        inputs: [
          {
            table: { schema: "public", name: "orders" },
            ...createMockDataTestRowsData({
              columns: [
                { name: "status", cast_type: "text" },
                { name: "total", cast_type: "numeric" },
              ],
              rows: [
                { status: "paid", total: 10 },
                { status: "refunded", total: 100 },
              ],
            }),
          },
        ],
      }),
    });

    const inputs = await screen.findByRole("region", { name: "Inputs" });
    expect(
      within(inputs).getByText(
        "The segment reads this test data instead of the real tables.",
      ),
    ).toBeInTheDocument();
    const orders = within(inputs).getByLabelText("public.orders");
    expect(within(orders).getByText("2 rows")).toBeInTheDocument();
    expect(within(orders).getByText("refunded")).toBeInTheDocument();
  });

  it("shows the checks on the rows the segment matches", async () => {
    setup({
      test: createMockSegmentTest({
        id: TEST_ID,
        segment_id: SEGMENT_ID,
        expectations: [
          createMockDataTestEqualsExpectation({
            name: "only paid orders match",
            columns: [{ name: "total", cast_type: "numeric" }],
            rows: [{ total: 10 }],
          }),
          createMockDataTestEmptyExpectation({
            name: "no refunded orders",
            sql: "SELECT * FROM {{output}} WHERE status = 'refunded'",
          }),
        ],
      }),
    });

    const output = await screen.findByRole("region", { name: "Output" });
    expect(
      within(output).getByText("Checks on the rows the segment matches."),
    ).toBeInTheDocument();

    const equals = within(output).getByLabelText("only paid orders match");
    expect(
      within(equals).getByText("Must hold exactly these rows"),
    ).toBeInTheDocument();
    expect(within(equals).getByText("10")).toBeInTheDocument();

    const empty = within(output).getByLabelText("no refunded orders");
    expect(
      await within(empty).findByText(/WHERE status = 'refunded'/),
    ).toBeInTheDocument();
  });
});
