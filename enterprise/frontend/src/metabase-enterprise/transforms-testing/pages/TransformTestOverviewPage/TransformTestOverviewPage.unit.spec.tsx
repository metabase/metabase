import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetTransformEndpoint,
  setupGetTransformTestEndpoint,
  setupRunTransformTestEndpoint,
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
import type { TransformTest } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTransform,
  createMockTransformTest,
  createMockTransformTestEmptyExpectation,
  createMockTransformTestEqualsExpectation,
  createMockTransformTestRowsData,
  createMockTransformTestRun,
  createMockTransformTestSqlData,
} from "metabase-types/api/mocks";

import { TransformTestOverviewPage } from "./TransformTestOverviewPage";

type SetupOpts = {
  test?: TransformTest;
  canWrite?: boolean;
};

function setup({
  test = createMockTransformTest({
    id: 2,
    transform_id: 1,
    name: "Refunded orders are excluded",
  }),
  canWrite = true,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  const transform = createMockTransform({
    id: 1,
    name: "Customer revenue",
    target: {
      type: "table",
      schema: "analytics",
      name: "customer_revenue",
      database: 1,
    },
  });
  setupDatabasesEndpoints([
    createMockDatabase({
      id: 1,
      transforms_permissions: canWrite ? "write" : "none",
    }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupGetTransformEndpoint(transform);
  setupGetTransformTestEndpoint(test);
  setupRunTransformTestEndpoint(test.id, {
    status: "passed",
    expectations: [],
    tables: {},
  });

  renderWithProviders(
    <Route
      path="/data-studio/transforms/:transformId/tests/:testId"
      element={<TransformTestOverviewPage />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.transformTest(transform.id, test.id),
    },
  );
}

describe("TransformTestOverviewPage", () => {
  it("shows the test name with a breadcrumb back to the transform tests", async () => {
    setup();

    expect(
      await screen.findAllByText("Refunded orders are excluded"),
    ).toHaveLength(2);
    expect(
      await screen.findByRole("link", { name: "Customer revenue" }),
    ).toHaveAttribute("href", Urls.transformTestList(1));
  });

  it("says when the test has never run", async () => {
    setup();

    expect(
      await screen.findByText("This test hasn't been run before."),
    ).toBeInTheDocument();
  });

  it("shows a passed last run as successful", async () => {
    setup({
      test: createMockTransformTest({
        id: 2,
        transform_id: 1,
        last_run: createMockTransformTestRun({ status: "passed" }),
      }),
    });

    expect(
      await screen.findByText(/Last ran .* successfully/),
    ).toBeInTheDocument();
  });

  it("links to all runs of the test", async () => {
    setup({
      test: createMockTransformTest({
        id: 2,
        transform_id: 1,
        last_run: createMockTransformTestRun({ status: "passed" }),
      }),
    });

    expect(
      await screen.findByRole("link", { name: "See all runs" }),
    ).toHaveAttribute("href", Urls.transformTestRuns(1, 2));
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute(
      "href",
      Urls.transformTestRuns(1, 2),
    );
  });

  it("shows a failed last run as failed", async () => {
    setup({
      test: createMockTransformTest({
        id: 2,
        transform_id: 1,
        last_run: createMockTransformTestRun({ status: "failed" }),
      }),
    });

    expect(await screen.findByText(/Last run failed/)).toBeInTheDocument();
  });

  it("runs the test and reloads it", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: /Run now/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/transform-test/2/run", {
          method: "POST",
        }),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/ee/transform-test/2"),
      ).toHaveLength(2);
    });
  });

  it("disables running for users who can't edit the transform", async () => {
    setup({ canWrite: false });

    expect(
      await screen.findByRole("button", { name: /Run now/ }),
    ).toBeDisabled();
  });

  it("shows the rows and queries that stand in for the input tables", async () => {
    setup({
      test: createMockTransformTest({
        id: 2,
        transform_id: 1,
        inputs: [
          {
            table: { schema: "raw", name: "customers" },
            ...createMockTransformTestRowsData({
              columns: [
                { name: "id", cast_type: "int" },
                { name: "country", cast_type: "text" },
              ],
              rows: [
                { id: 1, country: "US" },
                { id: 2, country: null },
              ],
            }),
          },
          {
            table: { schema: "raw", name: "orders" },
            ...createMockTransformTestSqlData({
              sql: "SELECT 10 AS id, 'paid' AS status",
            }),
          },
        ],
      }),
    });

    const inputs = await screen.findByRole("region", { name: "Inputs" });
    const customers = within(inputs).getByLabelText("raw.customers");
    expect(within(customers).getByText("2 rows")).toBeInTheDocument();
    expect(within(customers).getByText("country")).toBeInTheDocument();
    expect(within(customers).getByText("US")).toBeInTheDocument();
    expect(within(customers).getByText("null")).toBeInTheDocument();

    const orders = within(inputs).getByLabelText("raw.orders");
    expect(
      within(orders).getByText("Rows returned by a query"),
    ).toBeInTheDocument();
    expect(
      await within(orders).findByText(/SELECT 10 AS id/),
    ).toBeInTheDocument();
  });

  it("shows the checks on the transform output", async () => {
    setup({
      test: createMockTransformTest({
        id: 2,
        transform_id: 1,
        expectations: [
          createMockTransformTestEqualsExpectation({
            name: "revenue per customer",
            columns: [{ name: "revenue", cast_type: "numeric" }],
            rows: [{ revenue: 120 }],
          }),
          createMockTransformTestEmptyExpectation({
            name: "no negative revenue",
            sql: "SELECT * FROM analytics.customer_revenue WHERE revenue < 0",
          }),
        ],
      }),
    });

    const output = await screen.findByRole("region", { name: "Output" });
    expect(
      within(output).getByText(
        "Checks on analytics.customer_revenue, the table this transform writes.",
      ),
    ).toBeInTheDocument();

    const equals = within(output).getByLabelText("revenue per customer");
    expect(
      within(equals).getByText("Must hold exactly these rows"),
    ).toBeInTheDocument();
    expect(within(equals).getByText("120")).toBeInTheDocument();

    const empty = within(output).getByLabelText("no negative revenue");
    expect(
      within(empty).getByText("This query must return no rows"),
    ).toBeInTheDocument();
    expect(
      await within(empty).findByText(/WHERE revenue < 0/),
    ).toBeInTheDocument();
  });
});
