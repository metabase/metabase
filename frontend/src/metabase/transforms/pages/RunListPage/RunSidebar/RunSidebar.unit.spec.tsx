import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCancelCurrentTransformRunEndpoint,
  setupGetTransformEndpoint,
  setupListDatabaseSchemasEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
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
    { withUndos: true },
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

  it("should render the error section when message is present", async () => {
    const run = createMockTransformRun({
      status: "failed",
      message: "Something went wrong",
    });
    setup({ run });

    expect(
      await screen.findByRole("region", { name: "Error" }),
    ).toBeInTheDocument();
  });

  it("should not render the error section when message is null", () => {
    const run = createMockTransformRun({ message: null });
    setup({ run });

    expect(
      screen.queryByRole("region", { name: "Error" }),
    ).not.toBeInTheDocument();
  });

  describe("cancellation", () => {
    const transform = createMockTransform({ id: 10 });

    it("cancels a started run once the cancellation is confirmed", async () => {
      setupCancelCurrentTransformRunEndpoint(transform.id);
      setup({ run: createMockTransformRun({ status: "started", transform }) });

      await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));
      await userEvent.click(await screen.findByRole("button", { name: "Yes" }));

      await waitFor(() =>
        expect(
          fetchMock.callHistory.called(
            `path:/api/transform/${transform.id}/cancel`,
          ),
        ).toBe(true),
      );
      expect(
        screen.queryByText("Failed to cancel transform"),
      ).not.toBeInTheDocument();
    });

    it("shows an error when the cancel request fails", async () => {
      setupCancelCurrentTransformRunEndpoint(transform.id, 500);
      setup({ run: createMockTransformRun({ status: "started", transform }) });

      await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));
      await userEvent.click(await screen.findByRole("button", { name: "Yes" }));

      expect(
        await screen.findByText("Failed to cancel transform"),
      ).toBeInTheDocument();
    });

    it("does not offer to cancel a run that has ended", () => {
      setup({
        run: createMockTransformRun({ status: "succeeded", transform }),
      });

      expect(
        screen.queryByRole("button", { name: "Cancel run" }),
      ).not.toBeInTheDocument();
    });
  });
});
