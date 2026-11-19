import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetDataTestRunEndpoint,
  setupGetSegmentTestEndpoint,
  setupSchemaEndpoints,
  setupSegmentEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockCollection,
  createMockDataTestRunDetail,
  createMockDatabase,
  createMockSegment,
  createMockSegmentTest,
  createMockTable,
} from "metabase-types/api/mocks";

import { SegmentTestRunPage } from "./SegmentTestRunPage";

const DATABASE_ID = 1;
const TABLE_ID = 42;
const SEGMENT_ID = 7;
const TEST_ID = 2;
const RUN_ID = 9;
const DATA_MODEL_PARAMS = {
  databaseId: DATABASE_ID,
  schemaName: "PUBLIC",
  tableId: TABLE_ID,
  segmentId: SEGMENT_ID,
};

type SetupOpts = {
  location?: "published-table" | "data-model";
};

function setup({ location = "published-table" }: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const database = createMockDatabase({
    id: DATABASE_ID,
    native_permissions: "write",
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
  setupGetSegmentTestEndpoint(
    createMockSegmentTest({
      id: TEST_ID,
      segment_id: SEGMENT_ID,
      name: "Refunds",
    }),
  );
  setupGetDataTestRunEndpoint(
    createMockDataTestRunDetail({
      id: RUN_ID,
      test_type: "segment",
      test_id: TEST_ID,
      status: "failed",
      result: {
        status: "failed",
        tables: {},
        expectations: [
          {
            name: "no refunds",
            type: "empty",
            status: "failed",
            columns: [{ name: "refund_id", database_type: "integer" }],
            sample: [{ refund_id: 31 }],
            truncated: 0,
          },
        ],
      },
    }),
  );

  renderWithProviders(
    <>
      <Route
        path="/data-studio/library/tables/:tableId/segments/:segmentId/tests/:testId/runs/:runId"
        element={<SegmentTestRunPage />}
      />
      <Route
        path="/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/tests/:testId/runs/:runId"
        element={<SegmentTestRunPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute: Urls.dataTestRun(
        location === "data-model"
          ? Urls.dataStudioDataModelSegmentTest(DATA_MODEL_PARAMS, TEST_ID)
          : Urls.dataStudioPublishedTableSegmentTest(
              TABLE_ID,
              SEGMENT_ID,
              TEST_ID,
            ),
        RUN_ID,
      ),
    },
  );
}

describe("SegmentTestRunPage", () => {
  it("shows the stored result of a run of the segment test", async () => {
    setup();

    const result = await screen.findByRole("region", { name: "Result" });
    const expectation = within(result).getByRole("group", {
      name: "no refunds",
    });
    expect(expectation).toHaveTextContent("Failed");
    expect(
      within(
        within(expectation).getByLabelText("Rows the query returned"),
      ).getByText("31"),
    ).toBeInTheDocument();
  });

  it("links back to the runs and the segment of a published table", async () => {
    setup();

    const page = await screen.findByTestId("data-test-run");
    expect(
      within(page).getByRole("link", { name: /All runs/ }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioPublishedTableSegmentTestRuns(
        TABLE_ID,
        SEGMENT_ID,
        TEST_ID,
      ),
    );
    expect(
      await within(page).findByRole("link", { name: "Paid orders" }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioPublishedTableSegment(TABLE_ID, SEGMENT_ID),
    );
  });

  it("links back to the runs and the segment of a data model table", async () => {
    setup({ location: "data-model" });

    const page = await screen.findByTestId("data-test-run");
    expect(
      within(page).getByRole("link", { name: /All runs/ }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioDataModelSegmentTestRuns(DATA_MODEL_PARAMS, TEST_ID),
    );
    expect(
      await within(page).findByRole("link", { name: "Paid orders" }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioDataModelSegment(DATA_MODEL_PARAMS),
    );
  });
});
