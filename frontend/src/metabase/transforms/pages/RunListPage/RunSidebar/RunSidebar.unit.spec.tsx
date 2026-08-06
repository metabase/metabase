import {
  setupGetTransformEndpoint,
  setupListDatabaseSchemasEndpoint,
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
} from "metabase-types/api/mocks";

import { RunSidebar } from "./RunSidebar";

type SetupOpts = {
  run?: TransformRun;
};

function setup({ run = createMockTransformRun() }: SetupOpts = {}) {
  const onClose = jest.fn();
  if (run.transform) {
    setupGetTransformEndpoint(run.transform);
    setupListDatabaseSchemasEndpoint(run.transform.target.database, []);
  }
  renderWithProviders(
    <RunSidebar
      run={run}
      containerWidth={1200}
      onResizeStart={jest.fn()}
      onResizeStop={jest.fn()}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("RunSidebar", () => {
  it("should render the transform name in the header", async () => {
    const transform = createMockTransform({ name: "Test Transform" });
    const run = createMockTransformRun({ transform });
    setup({ run });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Test Transform")).toBeInTheDocument();
  });

  it("should render the info section", () => {
    const run = createMockTransformRun({ status: "succeeded" });
    setup({ run });

    expect(screen.getByRole("region", { name: "Info" })).toBeInTheDocument();
    expect(screen.getByText("Success")).toBeInTheDocument();
  });

  it("should render the error section when message is present", () => {
    const run = createMockTransformRun({
      status: "failed",
      message: "Something went wrong",
    });
    setup({ run });

    expect(screen.getByRole("region", { name: "Error" })).toBeInTheDocument();
  });

  it("should not render the error section when message is null", () => {
    const run = createMockTransformRun({ message: null });
    setup({ run });

    expect(
      screen.queryByRole("region", { name: "Error" }),
    ).not.toBeInTheDocument();
  });
});
