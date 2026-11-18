import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupGetCardTestEndpoint,
  setupRunCardTestEndpoint,
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
import type { CardTest } from "metabase-types/api";
import {
  createMockCard,
  createMockCardTest,
  createMockCollection,
  createMockDataTestEmptyExpectation,
  createMockDataTestEqualsExpectation,
  createMockDataTestRowsData,
  createMockDataTestRun,
} from "metabase-types/api/mocks";

import { CardTestOverviewPage } from "./CardTestOverviewPage";

type SetupOpts = {
  test?: CardTest;
  initialRoute?: string;
};

function setup({
  test = createMockCardTest({
    id: 2,
    card_id: 1,
    name: "Revenue ignores refunds",
  }),
  initialRoute = Urls.dataStudioMetricTest(1, test.id),
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupCardEndpoints(
    createMockCard({ id: 1, type: "metric", name: "Revenue", database_id: 1 }),
  );
  setupGetCardTestEndpoint(test);
  fetchMock.get("path:/api/ee/card-test/99", {
    status: 404,
    body: "No such test",
  });
  setupRunCardTestEndpoint(test.id, {
    status: "passed",
    expectations: [],
    tables: {},
  });

  renderWithProviders(
    <Route
      path="/data-studio/library/metrics/:cardId/tests/:testId"
      element={<CardTestOverviewPage />}
    />,
    {
      withRouter: true,
      initialRoute,
    },
  );
}

describe("CardTestOverviewPage", () => {
  it("shows the test name with a breadcrumb back to the metric tests", async () => {
    setup();

    expect(await screen.findAllByText("Revenue ignores refunds")).toHaveLength(
      2,
    );
    expect(
      await screen.findByRole("link", { name: "Revenue" }),
    ).toHaveAttribute("href", Urls.dataStudioMetricTestList(1));
  });

  it("selects the Overview tab on a URL that carries the metric name", async () => {
    setup({ initialRoute: "/data-studio/library/metrics/1-revenue/tests/2" });

    expect(
      await screen.findByRole("tab", { name: "Overview" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("says not found when the test belongs to another metric", async () => {
    setup({ test: createMockCardTest({ id: 2, card_id: 7 }) });

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
    expect(screen.queryByTestId("card-test-overview")).not.toBeInTheDocument();
  });

  it("says not found when the test id in the URL is not a number", async () => {
    setup({ initialRoute: "/data-studio/library/metrics/1/tests/nope" });

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
  });

  it("shows the error when the test can't be loaded", async () => {
    setup({ initialRoute: Urls.dataStudioMetricTest(1, 99) });

    expect(await screen.findByText("No such test")).toBeInTheDocument();
  });

  it("says when the test has never run", async () => {
    setup();

    expect(
      await screen.findByText("This test hasn't been run before."),
    ).toBeInTheDocument();
  });

  it("shows a failed last run as failed and links to all runs", async () => {
    setup({
      test: createMockCardTest({
        id: 2,
        card_id: 1,
        last_run: createMockDataTestRun({
          test_type: "card",
          status: "failed",
        }),
      }),
    });

    expect(await screen.findByText(/Last run failed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all runs" })).toHaveAttribute(
      "href",
      Urls.dataStudioMetricTestRuns(1, 2),
    );
    expect(screen.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "href",
      Urls.dataStudioMetricTestRuns(1, 2),
    );
  });

  it("runs the test and reloads it", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: /Run now/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/card-test/2/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/card-test/2"),
      ).toHaveLength(2);
    });
  });

  it("disables running for users who can't run the test", async () => {
    setup({
      test: createMockCardTest({ id: 2, card_id: 1, can_run: false }),
    });

    expect(
      await screen.findByRole("button", { name: /Run now/ }),
    ).toBeDisabled();
  });

  it("shows the rows that stand in for the input tables", async () => {
    setup({
      test: createMockCardTest({
        id: 2,
        card_id: 1,
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
        "The query reads this test data instead of the real tables.",
      ),
    ).toBeInTheDocument();
    const orders = within(inputs).getByLabelText("public.orders");
    expect(within(orders).getByText("2 rows")).toBeInTheDocument();
    expect(within(orders).getByText("refunded")).toBeInTheDocument();
  });

  it("shows the checks on the rows the query returns", async () => {
    setup({
      test: createMockCardTest({
        id: 2,
        card_id: 1,
        expectations: [
          createMockDataTestEqualsExpectation({
            name: "only paid orders count",
            columns: [{ name: "revenue", cast_type: "numeric" }],
            rows: [{ revenue: 10 }],
          }),
          createMockDataTestEmptyExpectation({
            name: "no negative revenue",
            sql: "SELECT * FROM {{output}} WHERE revenue < 0",
          }),
        ],
      }),
    });

    const output = await screen.findByRole("region", { name: "Output" });
    expect(
      within(output).getByText("Checks on the rows the query returns."),
    ).toBeInTheDocument();

    const equals = within(output).getByLabelText("only paid orders count");
    expect(
      within(equals).getByText("Must hold exactly these rows"),
    ).toBeInTheDocument();
    expect(within(equals).getByText("10")).toBeInTheDocument();

    const empty = within(output).getByLabelText("no negative revenue");
    expect(
      await within(empty).findByText(/WHERE revenue < 0/),
    ).toBeInTheDocument();
  });
});
