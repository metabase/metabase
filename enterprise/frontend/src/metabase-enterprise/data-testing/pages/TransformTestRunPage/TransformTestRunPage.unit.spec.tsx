import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetDataTestRunEndpoint,
  setupGetTransformEndpoint,
  setupGetTransformTestEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DataTestRunDetail,
  QueryTransformSource,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockDataTestRunDetail,
  createMockDataTestRunUser,
  createMockDatabase,
  createMockTransform,
  createMockTransformTest,
} from "metabase-types/api/mocks";

import { TransformTestRunPage } from "./TransformTestRunPage";

const QUERY_SOURCE: QueryTransformSource = {
  type: "query",
  query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
};

type SetupOpts = {
  run?: DataTestRunDetail;
};

function setup({ run = createMockDataTestRunDetail() }: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupGetTransformEndpoint(
    createMockTransform({ id: 1, source: QUERY_SOURCE }),
  );
  setupGetTransformTestEndpoint(
    createMockTransformTest({ id: 2, transform_id: 1, name: "Refunds" }),
  );
  setupGetDataTestRunEndpoint(run);

  renderWithProviders(
    <Route
      path="/data-studio/transforms/:transformId/tests/:testId/runs/:runId"
      element={<TransformTestRunPage />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.dataTestRun(Urls.transformTest(1, 2), run.id),
    },
  );
}

describe("TransformTestRunPage", () => {
  it("shows the failing expectations of a failed run with their rows", async () => {
    setup({
      run: createMockDataTestRunDetail({
        id: 7,
        test_id: 2,
        status: "failed",
        initiated_by_user: createMockDataTestRunUser({
          common_name: "Ada Admin",
        }),
        result: {
          status: "failed",
          tables: {},
          expectations: [
            {
              name: "revenue per customer",
              type: "equals",
              status: "failed",
              columns: [
                { name: "customer", database_type: "text" },
                { name: "revenue", database_type: "integer" },
              ],
              "row-counts": { actual: 1, expected: 1 },
              "extra-rows": [{ customer: "Ada", revenue: 120 }],
              "missing-rows": [{ customer: "Ada", revenue: 150 }],
              "cell-mismatches": [
                { column: "revenue", expected: 150, actual: 120 },
              ],
              truncated: 0,
            },
            {
              name: "no refunds",
              type: "empty",
              status: "failed",
              columns: [{ name: "refund_id", database_type: "integer" }],
              sample: [{ refund_id: 31 }],
              truncated: 4,
            },
            {
              name: "has a total",
              type: "empty",
              status: "error",
              error: {
                type: "expectation-failed",
                message: 'Column "total" not found',
              },
            },
            { name: "no nulls", type: "empty", status: "passed" },
          ],
        },
      }),
    });

    const result = await screen.findByRole("region", { name: "Result" });

    const equals = within(result).getByRole("group", {
      name: "revenue per customer",
    });
    expect(equals).toHaveTextContent("Failed");
    expect(
      within(equals).getByRole("link", { name: "revenue per customer" }),
    ).toHaveAttribute(
      "href",
      `${Urls.transformTest(1, 2)}#expectation-revenue%20per%20customer`,
    );
    expect(
      within(equals).getByText("Returned 1 row, expected 1"),
    ).toBeInTheDocument();
    expect(within(equals).getByText("customer")).toBeInTheDocument();
    const unexpected = within(equals).getByRole("row", { name: /Unexpected/ });
    expect(unexpected).toHaveAttribute("data-row-kind", "unexpected");
    expect(within(unexpected).getByText("Ada")).toBeInTheDocument();
    expect(within(unexpected).getByText("120")).toBeInTheDocument();
    const missing = within(equals).getByRole("row", { name: /Missing/ });
    expect(missing).toHaveAttribute("data-row-kind", "missing");
    expect(within(missing).getByText("150")).toBeInTheDocument();

    const empty = within(result).getByRole("group", { name: "no refunds" });
    expect(within(empty).getByText("Expected no rows")).toBeInTheDocument();
    expect(
      within(within(empty).getByRole("row", { name: /Unexpected/ })).getByText(
        "31",
      ),
    ).toBeInTheDocument();
    expect(
      within(empty).getByText("4 more rows are not shown."),
    ).toBeInTheDocument();

    const errored = within(result).getByRole("group", { name: "has a total" });
    expect(errored).toHaveTextContent("Error");
    expect(
      within(errored).getByText('Column "total" not found'),
    ).toBeInTheDocument();

    const passed = within(result).getByRole("group", { name: "no nulls" });
    expect(passed).toHaveTextContent("Passed");
    expect(within(passed).queryByRole("row")).not.toBeInTheDocument();

    const info = screen.getByRole("region", { name: "Info" });
    expect(
      within(info).getByRole("group", { name: "Status" }),
    ).toHaveTextContent("Failed");
    expect(
      within(info).getByRole("group", { name: "Run by" }),
    ).toHaveTextContent("Ada Admin");
  });

  it("is a page of its own, with the run in the title and the breadcrumbs", async () => {
    setup({
      run: createMockDataTestRunDetail({
        id: 7,
        test_id: 2,
        start_time: "2026-01-01T00:00:00Z",
      }),
    });

    const header = await screen.findByTestId("transform-test-header");
    const breadcrumbs = within(header).getByTestId("data-studio-breadcrumbs");
    expect(
      await within(breadcrumbs).findByRole("link", { name: "Refunds" }),
    ).toHaveAttribute("href", Urls.transformTest(1, 2));
    expect(
      within(breadcrumbs).getByRole("link", { name: "Runs" }),
    ).toHaveAttribute("href", Urls.transformTestRuns(1, 2));
    expect(within(breadcrumbs).getByText(/Run from/)).toBeInTheDocument();
    expect(within(header).getAllByText(/Run from/)).toHaveLength(2);
    expect(
      within(header).queryByRole("link", { name: "Overview" }),
    ).not.toBeInTheDocument();
  });

  it("shows why a run was refused", async () => {
    setup({
      run: createMockDataTestRunDetail({
        test_id: 2,
        status: "error",
        result: {
          message: "The query under test failed to run: no such table",
          "error-code": "transform-test.query-failed",
        },
      }),
    });

    const result = await screen.findByRole("region", { name: "Result" });
    expect(
      within(result).getByText(
        "The query under test failed to run: no such table",
      ),
    ).toBeInTheDocument();
  });

  it("says so when a run has no stored result", async () => {
    setup({
      run: createMockDataTestRunDetail({
        test_id: 2,
        status: "failed",
        result: null,
      }),
    });

    const result = await screen.findByRole("region", { name: "Result" });
    expect(
      within(result).getByText("This run has no stored result."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Info" })).getByRole("group", {
        name: "Status",
      }),
    ).toHaveTextContent("Failed");
  });

  it("says who can see the result when the viewer cannot", async () => {
    setup({
      run: createMockDataTestRunDetail({
        test_id: 2,
        status: "failed",
        result: null,
        can_read_result: false,
      }),
    });

    const result = await screen.findByRole("region", { name: "Result" });
    expect(
      within(result).getByText(
        "Only the person who started this run and admins can see its result.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the run of another test", async () => {
    setup({ run: createMockDataTestRunDetail({ test_id: 3 }) });

    expect(await screen.findByText("Not found.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Result" }),
    ).not.toBeInTheDocument();
  });
});
