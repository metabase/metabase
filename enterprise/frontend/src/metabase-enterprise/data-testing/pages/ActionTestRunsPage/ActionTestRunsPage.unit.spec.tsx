import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetActionTestEndpoint,
  setupListDataTestRunsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockActionTest,
  createMockCollection,
  createMockDataTestRunUser,
  createMockDataTestRunWithUser,
  createMockDatabase,
  createMockListDataTestRunsResponse,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { ActionTestRunsPage } from "./ActionTestRunsPage";

function setup() {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupDatabasesEndpoints([
    createMockDatabase({
      id: 1,
      native_permissions: "write",
      settings: { "database-enable-actions": true },
    }),
  ]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupActionEndpoints(
    createMockQueryAction({ id: 1, name: "Refund order", database_id: 1 }),
  );
  setupGetActionTestEndpoint(
    createMockActionTest({ id: 2, action_id: 1, name: "Refunds" }),
  );
  setupListDataTestRunsEndpoint(
    createMockListDataTestRunsResponse({
      data: [
        createMockDataTestRunWithUser({
          id: 1,
          test_type: "action",
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
      path="/data-studio/actions/:actionId/tests/:testId/runs"
      element={<ActionTestRunsPage />}
    />,
    {
      withRouter: true,
      initialRoute: Urls.dataStudioActionTestRuns(1, 2),
    },
  );
}

describe("ActionTestRunsPage", () => {
  it("lists the runs of the action test", async () => {
    setup();

    const row = await screen.findByRole("row", { name: /Ada Admin/ });
    expect(within(row).getByText("Failed")).toBeInTheDocument();

    const call = fetchMock.callHistory.lastCall("path:/api/ee/data-test-run", {
      method: "GET",
    });
    const { searchParams } = new URL(call?.url ?? "", "http://localhost");
    expect(searchParams.get("test-type")).toBe("action");
    expect(searchParams.get("test-id")).toBe("2");
  });

  it("links the selected run back to the action", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("row", { name: /Ada Admin/ }),
    );

    const sidebar = await screen.findByTestId("data-test-run-sidebar");
    expect(
      await within(sidebar).findByRole("link", { name: "Refund order" }),
    ).toHaveAttribute("href", Urls.dataStudioAction(1));
  });
});
