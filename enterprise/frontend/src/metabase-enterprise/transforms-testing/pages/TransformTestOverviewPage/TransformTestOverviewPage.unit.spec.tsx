import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupGetTransformEndpoint,
  setupGetTransformTestEndpoint,
  setupRunTransformTestEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TransformTest } from "metabase-types/api";
import {
  createMockCollection,
  createMockDatabase,
  createMockTransform,
  createMockTransformTest,
  createMockTransformTestRun,
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
  const transform = createMockTransform({ id: 1, name: "Customer revenue" });
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
});
