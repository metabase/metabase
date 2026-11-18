import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupGetCardTestEndpoint,
  setupListCardTestsEndpoint,
  setupMetricEndpoint,
  setupRunCardTestEndpoint,
} from "__support__/server-mocks";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
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
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { CardTest } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCardTest,
  createMockCollection,
  createMockDataTestEmptyExpectation,
  createMockDataTestEqualsExpectation,
  createMockDataTestRun,
  createMockDataset,
  createMockMetric,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { CardTestOverviewPage } from "../CardTestOverviewPage";

import { CardTestListPage } from "./CardTestListPage";

const CARD_ID = 42;

type SetupOpts = {
  tests?: CardTest[];
};

function setup({ tests = [] }: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const database = createSampleDatabase();
  const card = createMockCard({
    id: CARD_ID,
    type: "metric",
    name: "Revenue",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    }),
  });
  setupDatabasesEndpoints([database]);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [database] }),
  );
  setupCardQueryEndpoints(card, createMockDataset());
  setupMetricEndpoint(createMockMetric({ id: card.id, name: card.name }));
  setupCollectionsEndpoints({ collections: [createMockCollection()] });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);
  setupListCardTestsEndpoint(tests);
  tests.forEach(setupGetCardTestEndpoint);

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
        path="/data-studio/library/metrics/:cardId/tests"
        element={<CardTestListPage />}
      />
      <Route
        path="/data-studio/library/metrics/:cardId/tests/:testId"
        element={<CardTestOverviewPage />}
      />
    </>,
    {
      withRouter: true,
      initialRoute: Urls.dataStudioMetricTestList(CARD_ID),
      storeInitialState,
    },
  );
  return { router };
}

describe("CardTestListPage", () => {
  it("lists the tests of the metric with their checks and last run", async () => {
    setup({
      tests: [
        createMockCardTest({
          id: 1,
          card_id: CARD_ID,
          name: "Revenue ignores refunds",
          expectations: [
            createMockDataTestEqualsExpectation(),
            createMockDataTestEmptyExpectation(),
          ],
          last_run: createMockDataTestRun({
            test_type: "card",
            status: "passed",
          }),
        }),
        createMockCardTest({
          id: 2,
          card_id: CARD_ID,
          name: "Pending orders are excluded",
          last_run: createMockDataTestRun({
            id: 2,
            test_type: "card",
            status: "failed",
          }),
        }),
        createMockCardTest({
          id: 3,
          card_id: CARD_ID,
          name: "Null totals count as zero",
        }),
      ],
    });

    const passedRow = await findRow("Revenue ignores refunds");
    expect(within(passedRow).getByText("2")).toBeInTheDocument();
    expect(within(passedRow).getByText(/Last run/)).toBeInTheDocument();

    const failedRow = await findRow("Pending orders are excluded");
    expect(within(failedRow).getByText(/Failed/)).toBeInTheDocument();

    const neverRunRow = await findRow("Null totals count as zero");
    expect(
      within(neverRunRow).queryByText(/Last run|Failed/),
    ).not.toBeInTheDocument();
  });

  it("asks only for the tests of this metric", async () => {
    setup();

    expect(await screen.findByText("No tests yet")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called("path:/api/ee/card-test", {
        method: "GET",
        query: { "card-id": String(CARD_ID) },
      }),
    ).toBe(true);
  });

  it("shows the Tests tab of the metric as selected", async () => {
    setup();

    expect(await screen.findByRole("tab", { name: "Tests" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("runs a test from the row menu and reloads the list", async () => {
    setup({
      tests: [createMockCardTest({ id: 1, card_id: CARD_ID, name: "Refunds" })],
    });
    setupRunCardTestEndpoint(1, {
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
        fetchMock.callHistory.called("path:/api/ee/card-test/1/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/card-test", {
          method: "GET",
        }),
      ).toHaveLength(2);
    });
  });

  it("opens a test when its row is clicked", async () => {
    const { router } = setup({
      tests: [createMockCardTest({ id: 5, card_id: CARD_ID, name: "Refunds" })],
    });

    await userEvent.click(await screen.findByText("Refunds"));

    expect(await screen.findByTestId("card-test-overview")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(
      Urls.dataStudioMetricTest(CARD_ID, 5),
    );
  });

  it("links to the runs of a test from the row menu", async () => {
    setup({
      tests: [createMockCardTest({ id: 5, card_id: CARD_ID, name: "Refunds" })],
    });

    const row = await findRow("Refunds");
    await userEvent.click(within(row).getByLabelText("Test options"));

    expect(
      await screen.findByRole("menuitem", { name: /View runs/ }),
    ).toHaveAttribute("href", Urls.dataStudioMetricTestRuns(CARD_ID, 5));
  });

  it("hides the row menu from users who can't run the tests", async () => {
    setup({
      tests: [
        createMockCardTest({
          id: 1,
          card_id: CARD_ID,
          name: "Refunds",
          can_run: false,
        }),
      ],
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
