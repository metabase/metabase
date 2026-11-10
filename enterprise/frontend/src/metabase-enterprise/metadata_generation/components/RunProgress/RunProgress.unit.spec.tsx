import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCancelMetadataGenerationRunEndpoint,
  setupGetMetadataGenerationRunEndpoint,
  setupGetMetadataGenerationRunErrorEndpoint,
  setupListMetadataGenerationProposalsEndpoint,
  setupRetryFailedMetadataGenerationRunEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetadataGenerationRun } from "metabase-types/api";
import {
  createMockMetadataGenerationRun,
  createMockUser,
} from "metabase-types/api/mocks";

import { RUN_POLLING_INTERVAL } from "../../utils";
import { PendingBadge } from "../PendingBadge";

import { RunProgress } from "./RunProgress";

const TABLE_ID = 10;
const PROPOSALS_ROUTE = `metadata-generation-proposals-${TABLE_ID}`;

function setup(run: MetadataGenerationRun) {
  setupGetMetadataGenerationRunEndpoint(run);
  setupCancelMetadataGenerationRunEndpoint({ ...run, status: "canceling" });
  const retryRun = createMockMetadataGenerationRun({ id: run.id + 1 });
  setupRetryFailedMetadataGenerationRunEndpoint(run.id, retryRun);
  setupGetMetadataGenerationRunEndpoint(retryRun);

  const onRetry = jest.fn();
  const onReview = jest.fn();
  renderWithProviders(
    <RunProgress runId={run.id} onRetry={onRetry} onReview={onReview} />,
  );
  return { onRetry, onReview, retryRun };
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
      await screen.findByText("4 of 10 tables processed"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 table failed")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metadata-generation-run-status"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Retry failed tables/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review suggestions" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/data-sensitivity/runs/${run.id}/cancel`,
          { method: "POST" },
        ),
      ).toBe(true);
    });
  });

  it("shows no status and no cancel button while a run is canceling", async () => {
    setup(
      createMockMetadataGenerationRun({
        status: "canceling",
        is_active: true,
        total_tables: 10,
        done_tables: 2,
      }),
    );

    expect(
      await screen.findByText("2 of 10 tables processed"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("metadata-generation-run-status"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Retry failed tables/ }),
    );
    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(retryRun));
  });

  it("offers review and no other action for a run that succeeded", async () => {
    const { onReview } = setup(
      createMockMetadataGenerationRun({
        status: "succeeded",
        is_active: null,
        total_tables: 2,
        done_tables: 2,
        ended_at: "2026-10-09T00:10:00Z",
      }),
    );

    expect(
      await screen.findByTestId("metadata-generation-run-status"),
    ).toHaveTextContent("Done");
    expect(screen.getByText("2 of 2 tables processed")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Review suggestions" }),
    );
    expect(onReview).toHaveBeenCalled();
  });

  it("stops polling a run that fails to load", async () => {
    const runId = 3;
    setupGetMetadataGenerationRunErrorEndpoint(runId, 404);
    renderWithProviders(<RunProgress runId={runId} />);

    const runUrl = `path:/api/ee/data-sensitivity/runs/${runId}`;
    await waitFor(() => {
      expect(fetchMock.callHistory.called(runUrl)).toBe(true);
    });
    await new Promise((resolve) =>
      setTimeout(resolve, RUN_POLLING_INTERVAL * 1.5),
    );

    expect(fetchMock.callHistory.calls(runUrl)).toHaveLength(1);
  });

  it("refreshes no pending suggestions when it opens a run that has ended", async () => {
    const run = createMockMetadataGenerationRun({
      status: "succeeded",
      is_active: null,
      ended_at: "2026-10-09T00:10:00Z",
    });
    setupGetMetadataGenerationRunEndpoint(run);
    setupListMetadataGenerationProposalsEndpoint(TABLE_ID, []);
    renderWithProviders(
      <>
        <PendingBadge
          tableId={TABLE_ID}
          isPreview={false}
          onPreviewChange={jest.fn()}
        />
        <RunProgress runId={run.id} />
      </>,
      {
        storeInitialState: {
          currentUser: createMockUser({ is_superuser: true }),
        },
      },
    );

    expect(
      await screen.findByTestId("metadata-generation-run-status"),
    ).toHaveTextContent("Done");
    await waitFor(() => {
      expect(fetchMock.callHistory.calls(PROPOSALS_ROUTE)).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fetchMock.callHistory.calls(PROPOSALS_ROUTE)).toHaveLength(1);
  });
});
