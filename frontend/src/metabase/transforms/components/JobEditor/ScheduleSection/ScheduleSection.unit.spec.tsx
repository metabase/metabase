import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCancelJobRunEndpoint,
  setupGetTransformJobEndpoint,
  setupRunTransformJobEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import {
  createMockTransformJob,
  createMockTransformRun,
} from "metabase-types/api/mocks";

import { ScheduleSection } from "./ScheduleSection";

type SetupOpts = {
  job?: TransformJob;
};

function setup({ job = createMockTransformJob() }: SetupOpts = {}) {
  setupGetTransformJobEndpoint(job);
  setupRunTransformJobEndpoint(job.id);

  const onScheduleChange = jest.fn();
  const { rerender } = renderWithProviders(
    <ScheduleSection job={job} onScheduleChange={onScheduleChange} />,
  );

  return { rerender, onScheduleChange };
}

describe("ScheduleSection", () => {
  it("should allow to change the schedule", async () => {
    const { onScheduleChange } = setup({
      job: createMockTransformJob({ ui_display_type: "cron/raw" }),
    });
    const cronInput = screen.getByPlaceholderText("For example 5 0 * Aug ?");
    await userEvent.clear(cronInput);
    await userEvent.type(cronInput, "0/12 * * * ?");
    await userEvent.tab();
    expect(onScheduleChange).toHaveBeenCalledWith(
      "0 0/12 * * * ? *",
      "cron/raw",
    );
  });

  it("should allow to manually run a job", async () => {
    const { rerender, onScheduleChange } = setup();
    const timestamp = new Date().toISOString();

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    rerender(
      <ScheduleSection
        job={createMockTransformJob({
          last_run: createMockTransformRun({
            status: "started",
            start_time: timestamp,
          }),
        })}
        onScheduleChange={onScheduleChange}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Running now…" }),
    ).toBeInTheDocument();

    rerender(
      <ScheduleSection
        job={createMockTransformJob({
          last_run: createMockTransformRun({
            status: "succeeded",
            start_time: timestamp,
            end_time: timestamp,
          }),
        })}
        onScheduleChange={onScheduleChange}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Ran successfully" }),
    ).toBeInTheDocument();
  });

  it("should allow cancelling a running job", async () => {
    const job = createMockTransformJob({
      id: 3,
      last_run: createMockTransformRun({ id: 42, status: "started" }),
    });
    setupCancelJobRunEndpoint(3, 42);
    setup({ job });

    await userEvent.click(screen.getByTestId("cancel-button"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel run" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/transform-job/3/runs/42/cancel",
        ),
      ).toBe(true);
    });
  });

  it("should handle job run failures", async () => {
    const { rerender, onScheduleChange } = setup();
    const timestamp = new Date().toISOString();

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    rerender(
      <ScheduleSection
        job={createMockTransformJob({
          last_run: createMockTransformRun({
            status: "failed",
            start_time: timestamp,
            end_time: timestamp,
          }),
        })}
        onScheduleChange={onScheduleChange}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Run failed" }),
    ).toBeInTheDocument();
  });

  it("should handle job run timeouts", async () => {
    const { rerender, onScheduleChange } = setup();
    const timestamp = new Date().toISOString();

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    rerender(
      <ScheduleSection
        job={createMockTransformJob({
          last_run: createMockTransformRun({
            status: "timeout",
            start_time: timestamp,
            end_time: timestamp,
          }),
        })}
        onScheduleChange={onScheduleChange}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Run failed" }),
    ).toBeInTheDocument();
  });
});
