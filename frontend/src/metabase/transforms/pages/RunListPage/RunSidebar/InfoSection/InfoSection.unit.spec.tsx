import {
  setupGetTransformEndpoint,
  setupListAnyDatabaseSchemasEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { TransformRun } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformRun,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import { InfoSection } from "./InfoSection";

type SetupOpts = {
  run?: TransformRun;
};

function setup({ run = createMockTransformRun() }: SetupOpts = {}) {
  setupGetTransformEndpoint(
    createMockTransform({
      id: 5,
      target: createMockTransformTarget({ schema: "public", name: "orders" }),
    }),
  );
  setupListAnyDatabaseSchemasEndpoint();
  renderWithProviders(<InfoSection run={run} />);
}

describe("InfoSection", () => {
  it("should render started at with formatted date", () => {
    const run = createMockTransformRun({
      start_time: "2026-01-30T18:00:00Z",
    });
    setup({ run });

    expect(screen.getByText("Started at")).toBeInTheDocument();
    expect(screen.getByText("January 30, 2026, 6:00 PM")).toBeInTheDocument();
  });

  it("should render ended at with formatted date", () => {
    const run = createMockTransformRun({
      end_time: "2026-01-30T19:30:00Z",
    });
    setup({ run });

    expect(screen.getByText("Ended at")).toBeInTheDocument();
    expect(screen.getByText("January 30, 2026, 7:30 PM")).toBeInTheDocument();
  });

  it("should not render ended at when end_time is null", () => {
    const run = createMockTransformRun({ end_time: null });
    setup({ run });

    expect(screen.queryByText("Ended at")).not.toBeInTheDocument();
  });

  it("should render succeeded status", () => {
    const run = createMockTransformRun({ status: "succeeded" });
    setup({ run });

    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("should render failed status", () => {
    const run = createMockTransformRun({ status: "failed" });
    setup({ run });

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("should render manual trigger", () => {
    const run = createMockTransformRun({ run_method: "manual" });
    setup({ run });

    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("should render schedule trigger", () => {
    const run = createMockTransformRun({ run_method: "cron" });
    setup({ run });

    expect(screen.getByText("Schedule")).toBeInTheDocument();
  });

  it("should render the output table of the run", async () => {
    const run = createMockTransformRun({
      transform: createMockTransform({ id: 5 }),
    });
    setup({ run });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Output table")).toBeInTheDocument();
    expect(screen.getByTestId("output-table-link")).toHaveTextContent("orders");
  });

  it("should not render the output table when the run has no transform", () => {
    const run = createMockTransformRun({ transform: undefined });
    setup({ run });

    expect(screen.queryByText("Output table")).not.toBeInTheDocument();
  });
});
