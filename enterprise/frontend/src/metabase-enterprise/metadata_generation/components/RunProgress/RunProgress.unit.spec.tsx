import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCancelMetadataGenerationRunEndpoint,
  setupGetMetadataGenerationRunEndpoint,
  setupRetryFailedMetadataGenerationRunEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetadataGenerationRun } from "metabase-types/api";
import { createMockMetadataGenerationRun } from "metabase-types/api/mocks";

import { RunProgress } from "./RunProgress";

function setup(run: MetadataGenerationRun) {
  setupGetMetadataGenerationRunEndpoint(run);
  setupCancelMetadataGenerationRunEndpoint({ ...run, status: "canceling" });
  const retryRun = createMockMetadataGenerationRun({ id: run.id + 1 });
  setupRetryFailedMetadataGenerationRunEndpoint(run.id, retryRun);
  setupGetMetadataGenerationRunEndpoint(retryRun);

  const onRetry = jest.fn();
  renderWithProviders(<RunProgress runId={run.id} onRetry={onRetry} />);
  return { onRetry, retryRun };
}

describe("RunProgress", () => {
  it("shows the progress of a running run and cancels it", async () => {
    const run = createMockMetadataGenerationRun({
      status: "running",
      total_tables: 10,
      done_tables: 3,
      failed_tables: 1,
    });
    setup(run);

    expect(
      await screen.findByTestId("metadata-generation-run-status"),
    ).toHaveTextContent("Running");
    expect(screen.getByText("4 of 10 tables processed")).toBeInTheDocument();
    expect(screen.getByText("1 table failed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Retry failed tables/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/data-sensitivity/runs/${run.id}/cancel`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });

  it("shows no cancel button while a run is canceling", async () => {
    setup(
      createMockMetadataGenerationRun({ status: "canceling", is_active: true }),
    );

    expect(
      await screen.findByTestId("metadata-generation-run-status"),
    ).toHaveTextContent("Canceling");
    expect(
      screen.queryByRole("button", { name: "Cancel run" }),
    ).not.toBeInTheDocument();
  });

  it("shows failed tables and retries them for an ended run", async () => {
    const run = createMockMetadataGenerationRun({
      status: "canceled",
      is_active: null,
      total_tables: 3,
      done_tables: 1,
      failed_tables: 0,
      ended_at: "2026-10-09T00:10:00Z",
      table_errors: [
        {
          table_id: 20,
          table_name: "orders",
          schema: "public",
          message: "Not processed",
          error_code: "not_processed",
        },
      ],
    });
    const { onRetry, retryRun } = setup(run);

    expect(
      await screen.findByTestId("metadata-generation-run-status"),
    ).toHaveTextContent("Canceled");
    expect(
      screen.getByTestId("metadata-generation-table-errors"),
    ).toHaveTextContent("orders: Not processed");
    expect(
      screen.queryByRole("button", { name: "Cancel run" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Retry failed tables/ }),
    );
    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(retryRun));
  });

  it("shows usage and no actions for a run that succeeded", async () => {
    setup(
      createMockMetadataGenerationRun({
        status: "succeeded",
        is_active: null,
        total_tables: 2,
        done_tables: 2,
        ended_at: "2026-10-09T00:10:00Z",
        usage: {
          input_tokens: 1000,
          output_tokens: 234,
          total_tokens: 1234,
          cost_usd: 0.5,
        },
      }),
    );

    expect(
      await screen.findByTestId("metadata-generation-run-status"),
    ).toHaveTextContent("Done");
    expect(screen.getByText("2 of 2 tables processed")).toBeInTheDocument();
    expect(screen.getByText("1,234 tokens, about $0.50")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
