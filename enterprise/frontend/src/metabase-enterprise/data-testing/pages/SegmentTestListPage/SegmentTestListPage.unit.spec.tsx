import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupListSegmentTestsEndpoint,
  setupRunSegmentTestEndpoint,
  setupSchemaEndpoints,
  setupSegmentEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
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
  createMockDataTestRun,
  createMockDatabase,
  createMockSegment,
  createMockSegmentTest,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  DataModelSegmentTestListPage,
  PublishedTableSegmentTestListPage,
} from "./SegmentTestListPage";

const DATABASE_ID = 1;
const TABLE_ID = 42;
const SEGMENT_ID = 7;
const DATA_MODEL_PARAMS = {
  databaseId: DATABASE_ID,
  schemaName: "PUBLIC",
  tableId: TABLE_ID,
  segmentId: SEGMENT_ID,
};

type SetupOpts = {
  tests?: SegmentTest[];
  canRunNativeQueries?: boolean;
  location?: "published-table" | "data-model";
};

function setup({
  tests = [],
  canRunNativeQueries = true,
  location = "published-table",
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const database = createMockDatabase({
    id: DATABASE_ID,
    native_permissions: canRunNativeQueries ? "write" : "none",
  });
  const table = createMockTable({
    id: TABLE_ID,
    db_id: DATABASE_ID,
    db: database,
    schema: "PUBLIC",
    display_name: "Orders",
  });
  setupDatabasesEndpoints([database]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupSchemaEndpoints(database);
  setupTableEndpoints(table);
  setupSegmentEndpoint(
    createMockSegment({
      id: SEGMENT_ID,
      name: "Paid orders",
      table_id: TABLE_ID,
    }),
  );
  setupListSegmentTestsEndpoint(tests);

  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        "transforms-testing": true,
      }),
    }),
  });
  setupEnterpriseOnlyPlugin("data-testing");

  const { router } = renderWithProviders(
    <>
      <Route
        path="/data-studio/library/tables/:tableId/segments/:segmentId/tests"
        element={<PublishedTableSegmentTestListPage />}
      />
      <Route
        path="/data-studio/data/database/:databaseId/schema/:schemaId/table/:tableId/segments/:segmentId/tests"
        element={<DataModelSegmentTestListPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute:
        location === "data-model"
          ? Urls.dataStudioDataModelSegmentTestList(DATA_MODEL_PARAMS)
          : Urls.dataStudioPublishedTableSegmentTestList(TABLE_ID, SEGMENT_ID),
      storeInitialState,
    },
  );
  return { router };
}

describe("SegmentTestListPage", () => {
  it("lists the tests of the segment with their checks and last run", async () => {
    setup({
      tests: [
        createMockSegmentTest({
          id: 1,
          segment_id: SEGMENT_ID,
          name: "Refunds are excluded",
          expectations: [
            createMockDataTestEqualsExpectation(),
            createMockDataTestEmptyExpectation(),
          ],
          last_run: createMockDataTestRun({
            test_type: "segment",
            status: "passed",
          }),
        }),
        createMockSegmentTest({
          id: 2,
          segment_id: SEGMENT_ID,
          name: "Pending orders are excluded",
          last_run: createMockDataTestRun({
            id: 2,
            test_type: "segment",
            status: "failed",
          }),
        }),
        createMockSegmentTest({
          id: 3,
          segment_id: SEGMENT_ID,
          name: "Null totals are excluded",
        }),
      ],
    });

    const passedRow = await findRow("Refunds are excluded");
    expect(within(passedRow).getByText("2")).toBeInTheDocument();
    expect(within(passedRow).getByText(/Last run/)).toBeInTheDocument();

    const failedRow = await findRow("Pending orders are excluded");
    expect(within(failedRow).getByText(/Failed/)).toBeInTheDocument();

    const neverRunRow = await findRow("Null totals are excluded");
    expect(
      within(neverRunRow).queryByText(/Last run|Failed/),
    ).not.toBeInTheDocument();
  });

  it("asks only for the tests of this segment", async () => {
    setup();

    expect(await screen.findByText("No tests yet")).toBeInTheDocument();
    const call = fetchMock.callHistory.lastCall("path:/api/ee/segment-test", {
      method: "GET",
    });
    expect(
      new URL(call?.url ?? "", "http://localhost").searchParams.get(
        "segment-id",
      ),
    ).toBe(String(SEGMENT_ID));
  });

  it("shows the Tests tab of the segment as selected", async () => {
    setup();

    expect(await screen.findByRole("tab", { name: "Tests" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("runs a test from the row menu and reloads the list", async () => {
    setup({
      tests: [
        createMockSegmentTest({
          id: 1,
          segment_id: SEGMENT_ID,
          name: "Refunds",
        }),
      ],
    });
    setupRunSegmentTestEndpoint(1, {
      status: "passed",
      expectations: [],
      tables: {},
    });

    const row = await findRow("Refunds");
    await userEvent.click(within(row).getByLabelText("Test options"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Run test/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/segment-test/1/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/segment-test", {
          method: "GET",
        }),
      ).toHaveLength(2);
    });
  });

  it("opens a test of a published table segment when its row is clicked", async () => {
    const { router } = setup({
      tests: [
        createMockSegmentTest({
          id: 5,
          segment_id: SEGMENT_ID,
          name: "Refunds",
        }),
      ],
    });

    await userEvent.click(await screen.findByText("Refunds"));

    expect(router?.location.pathname).toBe(
      Urls.dataStudioPublishedTableSegmentTest(TABLE_ID, SEGMENT_ID, 5),
    );
  });

  it("links to the runs of a test from the row menu", async () => {
    setup({
      tests: [
        createMockSegmentTest({
          id: 5,
          segment_id: SEGMENT_ID,
          name: "Refunds",
        }),
      ],
    });

    const row = await findRow("Refunds");
    await userEvent.click(within(row).getByLabelText("Test options"));

    expect(
      await screen.findByRole("menuitem", { name: /View runs/ }),
    ).toHaveAttribute(
      "href",
      Urls.dataStudioPublishedTableSegmentTestRuns(TABLE_ID, SEGMENT_ID, 5),
    );
  });

  it("keeps a data model segment test inside the data model", async () => {
    const { router } = setup({
      location: "data-model",
      tests: [
        createMockSegmentTest({
          id: 5,
          segment_id: SEGMENT_ID,
          name: "Refunds",
        }),
      ],
    });

    expect(await screen.findByRole("tab", { name: "Tests" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(await screen.findByText("Refunds"));

    expect(router?.location.pathname).toBe(
      Urls.dataStudioDataModelSegmentTest(DATA_MODEL_PARAMS, 5),
    );
  });

  it("hides the row menu from users who can't run native queries on the database", async () => {
    setup({
      tests: [
        createMockSegmentTest({
          id: 1,
          segment_id: SEGMENT_ID,
          name: "Refunds",
        }),
      ],
      canRunNativeQueries: false,
    });

    const row = await findRow("Refunds");
    expect(
      within(row).queryByLabelText("Test options"),
    ).not.toBeInTheDocument();
  });
});

function findRow(name: string) {
  return screen.findByRole("row", { name: new RegExp(name) });
}
