import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupListTransformRunsEndpoint,
  setupListTransformTagsEndpoint,
  setupListTransformsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import * as Urls from "metabase/lib/urls";
import type { TransformRun } from "metabase-types/api";
import {
  createMockListTransformRunsResponse,
  createMockTransform,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { RunListPage } from "./RunListPage";

type SetupOpts = {
  runs?: TransformRun[];
};

function setup({ runs = [] }: SetupOpts = {}) {
  setupListTransformRunsEndpoint(
    createMockListTransformRunsResponse({
      data: runs,
      total: runs.length,
    }),
  );
  setupListTransformsEndpoint([]);
  setupListTransformTagsEndpoint([]);
  mockGetBoundingClientRect({ width: 1200, height: 800 });

  const path = Urls.transformRunList();

  renderWithProviders(<Route path={path} component={RunListPage} />, {
    withRouter: true,
    initialRoute: path,
  });
}

describe("RunListPage", () => {
  it("should render runs and open sidebar on click", async () => {
    const transform = createMockTransform({ name: "My Transform" });
    const run = createMockTransformRun({
      status: "succeeded",
      transform,
    });
    setup({ runs: [run] });

    const row = await screen.findByRole("row", { name: /My Transform/ });
    await userEvent.click(row);

    const infoSection = await screen.findByRole("region", { name: "Info" });
    expect(infoSection).toBeInTheDocument();
    expect(within(infoSection).getByText("Success")).toBeInTheDocument();
  });

  it("should show error section in sidebar for failed runs", async () => {
    const transform = createMockTransform({ name: "Broken Transform" });
    const run = createMockTransformRun({
      status: "failed",
      transform,
      message: 'relation "abc" does not exist',
    });
    setup({ runs: [run] });

    const row = await screen.findByRole("row", {
      name: /Broken Transform/,
    });
    await userEvent.click(row);

    expect(
      await screen.findByRole("region", { name: "Error" }),
    ).toBeInTheDocument();

    const infoSection = screen.getByRole("region", { name: "Info" });
    expect(within(infoSection).getByText("Failed")).toBeInTheDocument();
  });
});
