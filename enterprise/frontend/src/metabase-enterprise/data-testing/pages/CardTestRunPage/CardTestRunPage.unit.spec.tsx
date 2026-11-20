import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetCardTestEndpoint,
  setupGetDataTestRunEndpoint,
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
  createMockCard,
  createMockCardTest,
  createMockCollection,
  createMockDataTestRunDetail,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { CardTestRunPage } from "./CardTestRunPage";

function setup() {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({ id: 1, native_permissions: "write" }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupCardEndpoints(
    createMockCard({ id: 1, type: "metric", name: "Revenue", database_id: 1 }),
  );
  setupGetCardTestEndpoint(
    createMockCardTest({ id: 2, card_id: 1, name: "Refunds" }),
  );
  setupGetDataTestRunEndpoint(
    createMockDataTestRunDetail({
      id: 7,
      test_type: "card",
      test_id: 2,
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
    <Route
      path="/data-studio/library/metrics/:cardId/tests/:testId/runs/:runId"
      element={<CardTestRunPage />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.dataTestRun(Urls.dataStudioMetricTest(1, 2), 7),
    },
  );
}

describe("CardTestRunPage", () => {
  it("shows the stored result of a run of the card test", async () => {
    setup();

    const result = await screen.findByRole("region", { name: "Result" });
    const expectation = within(result).getByRole("group", {
      name: "no refunds",
    });
    expect(expectation).toHaveTextContent("Failed");
    expect(
      within(
        within(expectation).getByRole("row", { name: /Unexpected/ }),
      ).getByText("31"),
    ).toBeInTheDocument();
  });

  it("links back to the runs of the test and to the metric", async () => {
    setup();

    const breadcrumbs = within(
      await screen.findByTestId("card-test-header"),
    ).getByTestId("data-studio-breadcrumbs");
    expect(
      await within(breadcrumbs).findByRole("link", { name: "Runs" }),
    ).toHaveAttribute("href", Urls.dataStudioMetricTestRuns(1, 2));
    const page = screen.getByTestId("data-test-run");
    expect(
      await within(page).findByRole("link", { name: "Revenue" }),
    ).toHaveAttribute("href", Urls.dataStudioMetric(1));
  });
});
