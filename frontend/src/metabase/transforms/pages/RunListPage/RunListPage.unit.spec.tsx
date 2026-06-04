import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupListTransformRunsEndpoint,
  setupListTransformTagsEndpoint,
  setupListTransformsEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import * as Urls from "metabase/urls";
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
  setupUserMetabotPermissionsEndpoint();
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

  describe("Duration column", () => {
    it("renders a Duration column header when the table is populated", async () => {
      const transform = createMockTransform({ name: "Some Transform" });
      const run = createMockTransformRun({ status: "succeeded", transform });
      setup({ runs: [run] });
      expect(
        await screen.findByRole("columnheader", { name: /duration/i }),
      ).toBeInTheDocument();
    });

    it("renders the formatted duration for completed runs", async () => {
      // 8m 42s duration: start at 00:00:00, end at 00:08:42.
      const transform = createMockTransform({ name: "Long batch" });
      const run = createMockTransformRun({
        status: "succeeded",
        transform,
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: "2026-01-01T00:08:42.000Z",
      });
      setup({ runs: [run] });
      expect(await screen.findByText("8m 42s")).toBeInTheDocument();
    });

    it("renders the placeholder for runs still in progress (no end_time)", async () => {
      const transform = createMockTransform({ name: "In flight" });
      const run = createMockTransformRun({
        status: "started",
        transform,
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: null,
      });
      setup({ runs: [run] });

      // Resolve the Duration column's index from the headers (robust to
      // column reordering); then scope the placeholder assertion to that
      // specific gridcell in the in-progress row.
      const headers = await screen.findAllByRole("columnheader");
      const durationIndex = headers.findIndex((h) =>
        /duration/i.test(h.textContent ?? ""),
      );
      expect(durationIndex).toBeGreaterThan(-1);

      const row = await screen.findByRole("row", { name: /In flight/ });
      const cells = within(row).getAllByRole("gridcell");
      expect(cells[durationIndex]).toHaveTextContent("—");
    });
  });

  describe("Ended at column null handling", () => {
    it("renders the placeholder for runs still in progress (no end_time)", async () => {
      const transform = createMockTransform({ name: "Mid flight" });
      const run = createMockTransformRun({
        status: "started",
        transform,
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: null,
      });
      setup({ runs: [run] });

      const headers = await screen.findAllByRole("columnheader");
      const endedAtIndex = headers.findIndex((h) =>
        /ended at/i.test(h.textContent ?? ""),
      );
      expect(endedAtIndex).toBeGreaterThan(-1);

      const row = await screen.findByRole("row", { name: /Mid flight/ });
      const cells = within(row).getAllByRole("gridcell");
      expect(cells[endedAtIndex]).toHaveTextContent("—");
    });
  });
});
