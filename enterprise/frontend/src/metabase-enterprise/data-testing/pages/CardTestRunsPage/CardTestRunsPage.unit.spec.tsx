import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupGetCardTestEndpoint,
  setupListDataTestRunsEndpoint,
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
  createMockDataTestRunUser,
  createMockDataTestRunWithUser,
  createMockListDataTestRunsResponse,
} from "metabase-types/api/mocks";

import { CardTestRunsPage } from "./CardTestRunsPage";

function setup() {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupCardEndpoints(
    createMockCard({ id: 1, type: "metric", name: "Revenue", database_id: 1 }),
  );
  setupGetCardTestEndpoint(
    createMockCardTest({ id: 2, card_id: 1, name: "Refunds" }),
  );
  setupListDataTestRunsEndpoint(
    createMockListDataTestRunsResponse({
      data: [
        createMockDataTestRunWithUser({
          id: 1,
          test_type: "card",
          test_id: 2,
          status: "failed",
          initiated_by_user: createMockDataTestRunUser({
            common_name: "Ada Admin",
          }),
        }),
      ],
      total: 1,
    }),
  );

  renderWithProviders(
    <Route
      path="/data-studio/library/metrics/:cardId/tests/:testId/runs"
      element={<CardTestRunsPage />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.dataStudioMetricTestRuns(1, 2),
    },
  );
}

describe("CardTestRunsPage", () => {
  it("lists the runs of the card test", async () => {
    setup();

    const row = await screen.findByRole("row", { name: /Ada Admin/ });
    expect(within(row).getByText("Failed")).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/ee/data-test-run", {
      method: "GET",
    });
    const { searchParams } = new URL(call?.url ?? "", "http://localhost");
    expect(searchParams.get("test-type")).toBe("card");
    expect(searchParams.get("test-id")).toBe("2");
  });

  it("links the selected run back to the metric", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("row", { name: /Ada Admin/ }),
    );

    const sidebar = await screen.findByTestId("data-test-run-sidebar");
    expect(
      await within(sidebar).findByRole("link", { name: "Revenue" }),
    ).toHaveAttribute("href", Urls.dataStudioMetric(1));
  });
});
