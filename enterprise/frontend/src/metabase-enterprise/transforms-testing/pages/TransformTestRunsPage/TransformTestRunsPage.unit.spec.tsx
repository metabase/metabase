import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetTransformEndpoint,
  setupGetTransformTestEndpoint,
  setupListTransformTestRunsEndpoint,
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
import type { ListTransformTestRunsResponse } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockListTransformTestRunsResponse,
  createMockTransform,
  createMockTransformTest,
  createMockTransformTestRunUser,
  createMockTransformTestRunWithUser,
} from "metabase-types/api/mocks";

import { TransformTestRunsPage } from "./TransformTestRunsPage";

type SetupOpts = {
  response?: ListTransformTestRunsResponse;
  initialRoute?: string;
};

function setup({
  response = createMockListTransformTestRunsResponse(),
  initialRoute = Urls.transformTestRuns(1, 2),
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({ id: 1, transforms_permissions: "write" }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" })],
  });
  setupGetTransformEndpoint(createMockTransform({ id: 1 }));
  setupGetTransformTestEndpoint(
    createMockTransformTest({ id: 2, transform_id: 1, name: "Refunds" }),
  );
  setupListTransformTestRunsEndpoint(2, response);
  setupRunTransformTestEndpoint(2, {
    status: "passed",
    expectations: [],
    tables: {},
  });

  const { router } = renderWithProviders(
    <Route
      path="/data-studio/transforms/:transformId/tests/:testId/runs"
      element={<TransformTestRunsPage />}
    />,
    { withRouter: true, initialRoute },
  );
  return { router };
}

function getLastRunsRequestUrl() {
  const call = fetchMock.callHistory.lastCall(
    "path:/api/ee/transform-test/2/run",
    { method: "GET" },
  );
  return new URL(call?.url ?? "", "http://localhost");
}

describe("TransformTestRunsPage", () => {
  it("lists the runs with their status and who started them", async () => {
    setup({
      response: createMockListTransformTestRunsResponse({
        data: [
          createMockTransformTestRunWithUser({
            id: 1,
            status: "failed",
            initiated_by_user: createMockTransformTestRunUser({
              common_name: "Ada Admin",
            }),
          }),
          createMockTransformTestRunWithUser({
            id: 2,
            status: "passed",
            initiated_by_user: null,
          }),
        ],
        total: 2,
      }),
    });

    const failedRow = await screen.findByRole("row", { name: /Ada Admin/ });
    expect(within(failedRow).getByText("Failed")).toBeInTheDocument();
    expect(within(failedRow).getByText("2.0s")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Passed/ })).toBeInTheDocument();
  });

  it("shows an empty state when the test has no runs", async () => {
    setup();

    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
  });

  it("requests the page from the URL and moves to the next page", async () => {
    const { router } = setup({
      response: createMockListTransformTestRunsResponse({
        data: [createMockTransformTestRunWithUser()],
        total: 60,
        offset: 25,
      }),
      initialRoute: Urls.transformTestRuns(1, 2, { page: 1 }),
    });

    await screen.findByText("26 - 26");
    expect(getLastRunsRequestUrl().searchParams.get("offset")).toBe("25");

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(router?.location.search).toBe("?page=2");
  });

  it("runs the test", async () => {
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
  });

  it("requests the runs matching the filters in the URL", async () => {
    setup({
      initialRoute: Urls.transformTestRuns(1, 2, {
        statuses: ["failed", "error"],
        startTime: "past7days",
      }),
    });

    await screen.findByText("No runs found");
    const url = getLastRunsRequestUrl();
    expect(url.searchParams.getAll("statuses")).toEqual(["failed", "error"]);
    expect(url.searchParams.get("start-time")).toBe("past7days");
  });

  it("filters by status and goes back to the first page", async () => {
    const { router } = setup({
      initialRoute: Urls.transformTestRuns(1, 2, { page: 1 }),
    });

    await userEvent.click(await screen.findByLabelText("Status"));
    await userEvent.click(await screen.findByLabelText("Failed"));
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    expect(router?.location.search).toBe("?statuses=failed");
  });

  it("says no runs were found when filters are set", async () => {
    setup({
      initialRoute: Urls.transformTestRuns(1, 2, { statuses: ["failed"] }),
    });

    expect(await screen.findByText("No runs found")).toBeInTheDocument();
  });

  it("shows the details of a run in a sidebar", async () => {
    setup({
      response: createMockListTransformTestRunsResponse({
        data: [
          createMockTransformTestRunWithUser({
            id: 1,
            status: "failed",
            initiated_by_user: createMockTransformTestRunUser({
              common_name: "Ada Admin",
            }),
          }),
        ],
        total: 1,
      }),
    });

    await userEvent.click(
      await screen.findByRole("row", { name: /Ada Admin/ }),
    );

    const sidebar = await screen.findByTestId("transform-test-run-sidebar");
    const info = within(sidebar).getByRole("region", { name: "Info" });
    expect(
      within(info).getByRole("group", { name: "Status" }),
    ).toHaveTextContent("Failed");
    expect(
      within(info).getByRole("group", { name: "Run by" }),
    ).toHaveTextContent("Ada Admin");
    expect(
      within(info).getByRole("group", { name: "Started at" }),
    ).toBeInTheDocument();

    await userEvent.click(within(sidebar).getByLabelText("Close"));
    expect(
      screen.queryByTestId("transform-test-run-sidebar"),
    ).not.toBeInTheDocument();
  });
});
