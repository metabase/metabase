import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { ReactNode } from "react";
import { Route } from "react-router";

import {
  setupDeleteTransformJobEndpoint,
  setupListTransformJobsEndpoint,
  setupUpdateTransformJobEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks/state";
import type { TransformJob } from "metabase-types/api";
import {
  createMockTransformJob,
  createMockUser,
} from "metabase-types/api/mocks";

import { JobListPage } from "./JobListPage";

type MockTreeTableRow = {
  id: string;
  original: TransformJob;
  getVisibleCells: () => Array<{
    id: string;
    column: { columnDef: { cell?: unknown } };
    getContext: () => unknown;
  }>;
};

type MockTreeTableInstance = {
  table: { getRowModel: () => { rows: MockTreeTableRow[] } };
};

jest.mock("metabase/ui/components/data-display/TreeTable/TreeTable", () => {
  const { flexRender } = jest.requireActual("@tanstack/react-table");
  return {
    TreeTable: ({
      instance,
      emptyState,
      onRowClick,
    }: {
      instance: MockTreeTableInstance;
      emptyState: ReactNode;
      onRowClick?: (row: MockTreeTableRow, event: unknown) => void;
    }) => {
      const rows = instance.table.getRowModel().rows;
      if (rows.length === 0) {
        return <div data-testid="tree-table-mock">{emptyState}</div>;
      }
      return (
        <div data-testid="tree-table-mock">
          {rows.map((row) => (
            <div
              key={row.id}
              data-testid="job-row"
              data-job-id={row.original.id}
              onClick={(event) => onRowClick?.(row, event)}
            >
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} data-testid={`job-cell-${cell.id}`}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    },
  };
});

async function setup({
  jobs,
  isAdmin = false,
}: {
  jobs: TransformJob[];
  isAdmin?: boolean;
}) {
  setupListTransformJobsEndpoint(jobs);
  jobs.forEach(setupUpdateTransformJobEndpoint);
  jobs.forEach((job) => setupDeleteTransformJobEndpoint(job.id));

  const path = "/transforms/jobs";
  const { history } = renderWithProviders(
    <Route path={path} component={JobListPage} />,
    {
      withRouter: true,
      initialRoute: path,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  await screen.findByTestId("tree-table-mock");
  return { history };
}

async function findRow(jobId: number) {
  const rows = await screen.findAllByTestId("job-row");
  return rows.find((row) => row.dataset.jobId === String(jobId))!;
}

describe("JobListPage", () => {
  it("hides the bulk-action menu for admins when there are no jobs", async () => {
    await setup({ jobs: [], isAdmin: true });
    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });

  it("renders a Disabled badge only on disabled rows", async () => {
    await setup({
      jobs: [
        createMockTransformJob({ id: 1, name: "Enabled job", active: true }),
        createMockTransformJob({ id: 2, name: "Disabled job", active: false }),
      ],
    });

    const enabledRow = await findRow(1);
    const disabledRow = await findRow(2);
    expect(within(enabledRow).queryByText("Disabled")).not.toBeInTheDocument();
    expect(within(disabledRow).getByText("Disabled")).toBeInTheDocument();
  });

  it("opens the row action menu without navigating to the detail page", async () => {
    const { history } = await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: true,
    });

    const row = await findRow(1);
    await userEvent.click(within(row).getByLabelText("ellipsis icon"));

    expect(
      await screen.findByRole("menuitem", { name: /Disable/ }),
    ).toBeInTheDocument();
    expect(history?.getCurrentLocation().pathname).toBe("/transforms/jobs");
  });

  it("disables a job from the row action menu without navigating", async () => {
    const { history } = await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: true,
    });

    const row = await findRow(1);
    await userEvent.click(within(row).getByLabelText("ellipsis icon"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.lastCall("path:/api/transform-job/1", {
          method: "PUT",
        }),
      ).toBeDefined();
    });
    const call = fetchMock.callHistory.lastCall("path:/api/transform-job/1", {
      method: "PUT",
    });
    expect(await call?.request?.json()).toEqual({ active: false });
    expect(history?.getCurrentLocation().pathname).toBe("/transforms/jobs");
  });

  it("deletes a job from the row action menu without visiting the detail page", async () => {
    const { history } = await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: true,
    });
    const visited: string[] = [];
    history?.listen((location) => visited.push(location.pathname));

    const row = await findRow(1);
    await userEvent.click(within(row).getByLabelText("ellipsis icon"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete job" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.lastCall("path:/api/transform-job/1", {
          method: "DELETE",
        }),
      ).toBeDefined();
    });
    expect(visited.some((path) => path.includes("/jobs/1"))).toBe(false);
  });

  it("hides the row action menu for non-admin users", async () => {
    await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: false,
    });

    const row = await findRow(1);
    expect(
      within(row).queryByLabelText("ellipsis icon"),
    ).not.toBeInTheDocument();
  });

  it("hides the bulk-action menu for non-admin users even with jobs", async () => {
    await setup({
      jobs: [
        createMockTransformJob({ id: 1, name: "Job A", active: true }),
        createMockTransformJob({ id: 2, name: "Job B", active: true }),
      ],
      isAdmin: false,
    });

    expect(screen.queryByLabelText("ellipsis icon")).not.toBeInTheDocument();
  });
});
