import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetActionTestEndpoint,
  setupRunActionTestEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { ActionTest } from "metabase-types/api";
import {
  createMockActionTest,
  createMockCollection,
  createMockDataTestEmptyExpectation,
  createMockDataTestRowsData,
  createMockDataTestRun,
  createMockDatabase,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionTestOverviewPage } from "./ActionTestOverviewPage";

type SetupOpts = {
  test?: ActionTest;
  canRunNativeQueries?: boolean;
  hasActionsEnabled?: boolean;
  initialRoute?: string;
};

function setup({
  test = createMockActionTest({
    id: 2,
    action_id: 1,
    name: "Refund marks only that order",
  }),
  canRunNativeQueries = true,
  hasActionsEnabled = true,
  initialRoute = Urls.dataStudioActionTest(1, test.id),
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({
      id: 1,
      native_permissions: canRunNativeQueries ? "write" : "none",
      settings: { "database-enable-actions": hasActionsEnabled },
    }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupActionEndpoints(
    createMockQueryAction({ id: 1, name: "Refund order", database_id: 1 }),
  );
  setupGetActionTestEndpoint(test);
  fetchMock.get("path:/api/ee/action-test/99", {
    status: 404,
    body: "No such test",
  });
  setupRunActionTestEndpoint(test.id, {
    status: "passed",
    expectations: [],
    tables: {},
  });

  renderWithProviders(
    <Route
      path="/data-studio/actions/:actionId/tests/:testId"
      element={<ActionTestOverviewPage />}
    />,
    {
      withRouter: true,
      initialRoute,
    },
  );
}

describe("ActionTestOverviewPage", () => {
  it("shows the test name with a breadcrumb back to the action tests", async () => {
    setup();

    expect(
      await screen.findAllByText("Refund marks only that order"),
    ).toHaveLength(2);
    expect(
      await screen.findByRole("link", { name: "Refund order" }),
    ).toHaveAttribute("href", Urls.dataStudioActionTestList(1));
  });

  it("selects the Overview tab", async () => {
    setup();

    expect(
      await screen.findByRole("tab", { name: "Overview" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("says not found when the test belongs to another action", async () => {
    setup({ test: createMockActionTest({ id: 2, action_id: 7 }) });

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("action-test-overview"),
    ).not.toBeInTheDocument();
  });

  it("says not found when the test id in the URL is not a number", async () => {
    setup({ initialRoute: "/data-studio/actions/1/tests/nope" });

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
  });

  it("shows the error when the test can't be loaded", async () => {
    setup({ initialRoute: Urls.dataStudioActionTest(1, 99) });

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
      test: createMockActionTest({
        id: 2,
        action_id: 1,
        last_run: createMockDataTestRun({
          test_type: "action",
          status: "failed",
        }),
      }),
    });

    expect(await screen.findByText(/Last run failed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all runs" })).toHaveAttribute(
      "href",
      Urls.dataStudioActionTestRuns(1, 2),
    );
    expect(screen.getByRole("tab", { name: "Runs" })).toHaveAttribute(
      "href",
      Urls.dataStudioActionTestRuns(1, 2),
    );
  });

  it("runs the test and reloads it", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: /Run now/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/action-test/2/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/action-test/2"),
      ).toHaveLength(2);
    });
  });

  it("disables running for users who can't run native queries on the database", async () => {
    setup({ canRunNativeQueries: false });

    expect(
      await screen.findByRole("button", { name: /Run now/ }),
    ).toBeDisabled();
  });

  it("disables running when actions are disabled for the database", async () => {
    setup({ hasActionsEnabled: false });

    expect(
      await screen.findByRole("button", { name: /Run now/ }),
    ).toBeDisabled();
  });

  it("shows the values the action runs with", async () => {
    setup({
      test: createMockActionTest({
        id: 2,
        action_id: 1,
        parameters: { order_id: 1, reason: "damaged", notify: null },
      }),
    });

    const parameters = await screen.findByRole("region", {
      name: "Parameters",
    });
    const orderId = within(parameters).getByRole("row", { name: /order_id/ });
    expect(within(orderId).getByText("1")).toBeInTheDocument();
    const reason = within(parameters).getByRole("row", { name: /reason/ });
    expect(within(reason).getByText("damaged")).toBeInTheDocument();
    const notify = within(parameters).getByRole("row", { name: /notify/ });
    expect(within(notify).getByText("null")).toBeInTheDocument();
  });

  it("says when the test sets no parameter values", async () => {
    setup({
      test: createMockActionTest({ id: 2, action_id: 1, parameters: null }),
    });

    const parameters = await screen.findByRole("region", {
      name: "Parameters",
    });
    expect(
      within(parameters).getByText("This test sets no parameter values."),
    ).toBeInTheDocument();
  });

  it("shows the rows that stand in for the tables the action changes", async () => {
    setup({
      test: createMockActionTest({
        id: 2,
        action_id: 1,
        inputs: [
          {
            table: { schema: "public", name: "orders" },
            ...createMockDataTestRowsData({
              columns: [
                { name: "id", cast_type: "integer" },
                { name: "status", cast_type: "text" },
              ],
              rows: [
                { id: 1, status: "paid" },
                { id: 2, status: "pending" },
              ],
            }),
          },
        ],
      }),
    });

    const inputs = await screen.findByRole("region", { name: "Inputs" });
    expect(
      within(inputs).getByText(
        "The action runs on this test data instead of the real tables.",
      ),
    ).toBeInTheDocument();
    const orders = within(inputs).getByLabelText("public.orders");
    expect(within(orders).getByText("2 rows")).toBeInTheDocument();
    expect(within(orders).getByText("pending")).toBeInTheDocument();
  });

  it("shows the checks on the tables after the action runs", async () => {
    setup({
      test: createMockActionTest({
        id: 2,
        action_id: 1,
        expectations: [
          createMockDataTestEmptyExpectation({
            name: "only order 1 is refunded",
            sql: "SELECT * FROM public.orders WHERE id = 2 AND status = 'refunded'",
          }),
        ],
      }),
    });

    const checks = await screen.findByRole("region", { name: "Checks" });
    expect(
      within(checks).getByText("Checks on the tables after the action runs."),
    ).toBeInTheDocument();

    const empty = within(checks).getByLabelText("only order 1 is refunded");
    expect(
      within(empty).getByText("This query must return no rows"),
    ).toBeInTheDocument();
    expect(
      await within(empty).findByText(/status = 'refunded'/),
    ).toBeInTheDocument();
  });
});
