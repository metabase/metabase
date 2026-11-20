import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetSegmentTestEndpoint,
  setupListDataTestRunsEndpoint,
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
import {
  createMockCollection,
  createMockDataTestRunUser,
  createMockDataTestRunWithUser,
  createMockDatabase,
  createMockListDataTestRunsResponse,
  createMockSegment,
  createMockSegmentTest,
  createMockTable,
} from "metabase-types/api/mocks";

import { SegmentTestRunsPage } from "./SegmentTestRunsPage";

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
  setupListDataTestRunsEndpoint(
    createMockListDataTestRunsResponse({
      data: [
        createMockDataTestRunWithUser({
          id: 1,
          test_type: "segment",
          test_id: TEST_ID,
          status: "failed",
          initiated_by_user: createMockDataTestRunUser({
            common_name: "Ada Admin",
          }),
        }),
      ],
      total: 1,
    }),
  );

  const { router } = renderWithProviders(
    <>
      <Route
        path="/data-studio/library/tables/:tableId/segments/:segmentId/tests/:testId/runs"
        element={<SegmentTestRunsPage />}
      />
      <Route
        path="/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/tests/:testId/runs"
        element={<SegmentTestRunsPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute:
        location === "data-model"
          ? Urls.dataStudioDataModelSegmentTestRuns(DATA_MODEL_PARAMS, TEST_ID)
          : Urls.dataStudioPublishedTableSegmentTestRuns(
              TABLE_ID,
              SEGMENT_ID,
              TEST_ID,
            ),
    },
  );
  return { router };
}

describe("SegmentTestRunsPage", () => {
  it("lists the runs of the segment test", async () => {
    setup();

    const row = await screen.findByRole("row", { name: /Ada Admin/ });
    expect(within(row).getByText("Failed")).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/ee/data-test-run", {
      method: "GET",
    });
    const { searchParams } = new URL(call?.url ?? "", "http://localhost");
    expect(searchParams.get("test-type")).toBe("segment");
    expect(searchParams.get("test-id")).toBe(String(TEST_ID));
  });

  it("opens the page of a run of a published table segment test", async () => {
    const { router } = setup();

    await userEvent.click(
      await screen.findByRole("row", { name: /Ada Admin/ }),
    );

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        Urls.dataTestRun(
          Urls.dataStudioPublishedTableSegmentTest(
            TABLE_ID,
            SEGMENT_ID,
            TEST_ID,
          ),
          1,
        ),
      ),
    );
  });

  it("opens the page of a run of a data model segment test", async () => {
    const { router } = setup({ location: "data-model" });

    await userEvent.click(
      await screen.findByRole("row", { name: /Ada Admin/ }),
    );

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        Urls.dataTestRun(
          Urls.dataStudioDataModelSegmentTest(DATA_MODEL_PARAMS, TEST_ID),
          1,
        ),
      ),
    );
  });
});
