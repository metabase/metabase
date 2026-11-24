import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import type { ReactNode } from "react";

import {
  setupDatabaseListEndpoint,
  setupDeleteTransformJobEndpoint,
  setupListTransformJobTransformsEndpoint,
  setupListTransformJobsEndpoint,
  setupListTransformTagsEndpoint,
  setupUpdateTransformJobEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type { TransformJob, TransformJobId } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTransformJob,
  createMockUser,
} from "metabase-types/api/mocks";

import { JobPage } from "../JobPage";

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
  setupUserMetabotPermissionsEndpoint();
  setupListTransformJobsEndpoint(jobs);
  jobs.forEach(setupUpdateTransformJobEndpoint);
  jobs.forEach((job) => setupDeleteTransformJobEndpoint(job.id));

  const path = Urls.transformJobList();
  const { router } = renderWithProviders(
    <Route path={path} element={<JobListPage />} />,
    {
      withRouter: true,
      initialRoute: path,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );

  await screen.findByTestId("tree-table-mock");
  return { router };
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
    const { router } = await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: true,
    });

    const row = await findRow(1);
    await userEvent.click(within(row).getByLabelText("ellipsis icon"));

    expect(
      await screen.findByRole("menuitem", { name: /Disable/ }),
    ).toBeInTheDocument();
    expect(router?.location.pathname).toBe(Urls.transformJobList());
  });

  it("disables a job from the row action menu without navigating", async () => {
    const { router } = await setup({
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
    expect(router?.location.pathname).toBe(Urls.transformJobList());
  });

  it("deletes a job from the row action menu without visiting the detail page", async () => {
    const { router } = await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: true,
    });
    const visited: string[] = [];
    router?.onLocationChange((location) => visited.push(location.pathname));

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

  it("does not open the job when clicking inside its delete modal", async () => {
    const { router } = await setup({
      jobs: [createMockTransformJob({ id: 1, name: "Job", active: true })],
      isAdmin: true,
    });

    const row = await findRow(1);
    await userEvent.click(within(row).getByLabelText("ellipsis icon"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Delete/ }),
    );
    await userEvent.click(await screen.findByText("Delete this job?"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(router?.location.pathname).toBe(Urls.transformJobList());
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

const parseBody = (call: CallLog): unknown =>
  JSON.parse(String(call.options.body ?? "{}"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getJobId = (call: CallLog) => Number(call.expressParams?.id);

/**
 * An in-memory stand-in for the transform job endpoints. Each handler changes
 * the stored jobs itself, so the UI only shows a change after the request that
 * makes it.
 */
function setupJobsServer(initialJobs: TransformJob[]) {
  let jobs = [...initialJobs];
  const findJob = (id: TransformJobId) => jobs.find((job) => job.id === id);

  fetchMock.get("path:/api/transform-job", () => jobs);
  // registered before the `:id` routes so that `active` is not read as an id
  fetchMock.put("path:/api/transform-job/active", (call) => {
    const body = parseBody(call);
    if (!isRecord(body) || typeof body.active !== "boolean") {
      return 400;
    }
    const { active } = body;
    jobs = jobs.map((job) => ({ ...job, active }));
    return { updated: jobs.length, failed: 0 };
  });
  fetchMock.get("express:/api/transform-job/:id", (call) => {
    return findJob(getJobId(call)) ?? 404;
  });
  fetchMock.put("express:/api/transform-job/:id", (call) => {
    const job = findJob(getJobId(call));
    const body = parseBody(call);
    if (job == null || !isRecord(body) || typeof body.active !== "boolean") {
      return 404;
    }
    const updatedJob = { ...job, active: body.active };
    jobs = jobs.map((job) => (job.id === updatedJob.id ? updatedJob : job));
    return updatedJob;
  });
}

function setupWithJobPage(jobs: TransformJob[]) {
  setupUserMetabotPermissionsEndpoint();
  setupDatabaseListEndpoint([createMockDatabase()]);
  setupListTransformTagsEndpoint([]);
  jobs.forEach((job) => setupListTransformJobTransformsEndpoint(job.id, []));
  setupJobsServer(jobs);

  const path = Urls.transformJobList();
  const { router } = renderWithProviders(
    <>
      <Route path={path} element={<JobListPage />} />
      <Route path="/data-studio/transforms/jobs/:jobId" element={<JobPage />} />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: path,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
  return { router };
}

function getJobUpdateRequests() {
  return fetchMock.callHistory
    .calls("express:/api/transform-job/:id", { method: "PUT" })
    .filter((call) => !call.url.endsWith("/active"))
    .map((call) => ({ id: getJobId(call), body: parseBody(call) }));
}

function getBulkUpdateRequestBodies() {
  return fetchMock.callHistory
    .calls("path:/api/transform-job/active", { method: "PUT" })
    .map(parseBody);
}

async function findToast(message: string) {
  const toast = await screen.findByTestId("toast-undo");
  expect(within(toast).getByText(message)).toBeInTheDocument();
  await userEvent.click(within(toast).getByLabelText("close icon"));
  await waitFor(() =>
    expect(screen.queryByTestId("toast-undo")).not.toBeInTheDocument(),
  );
}

async function expectDisabledBadges(expected: Record<number, boolean>) {
  for (const [jobId, isDisabled] of Object.entries(expected)) {
    await waitFor(async () => {
      const row = await findRow(Number(jobId));
      if (isDisabled) {
        expect(within(row).getByText("Disabled")).toBeInTheDocument();
      } else {
        expect(within(row).queryByText("Disabled")).not.toBeInTheDocument();
      }
    });
  }
}

async function clickRowMenuItem(jobId: number, name: string) {
  const row = await findRow(jobId);
  await userEvent.click(within(row).getByLabelText("Job options"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: new RegExp(`${name}$`) }),
  );
}

async function openBulkActionsMenu() {
  await userEvent.click(screen.getByLabelText("More job options"));
}

describe("JobListPage active flag", () => {
  it("disables and re-enables jobs from the list, the detail page, and in bulk", async () => {
    const jobA = createMockTransformJob({ id: 1, name: "Job A", active: true });
    const jobB = createMockTransformJob({ id: 2, name: "Job B", active: true });
    const { router } = setupWithJobPage([jobA, jobB]);
    await expectDisabledBadges({ [jobA.id]: false, [jobB.id]: false });

    // disable Job B from the row menu, without navigating
    await clickRowMenuItem(jobB.id, "Disable");
    await waitFor(() =>
      expect(getJobUpdateRequests()).toEqual([
        { id: jobB.id, body: { active: false } },
      ]),
    );
    await findToast("Job disabled");
    await expectDisabledBadges({ [jobA.id]: false, [jobB.id]: true });
    expect(router?.location.pathname).toBe(Urls.transformJobList());

    // re-enable Job B from the row menu
    await clickRowMenuItem(jobB.id, "Re-enable");
    await waitFor(() =>
      expect(getJobUpdateRequests().slice(1)).toEqual([
        { id: jobB.id, body: { active: true } },
      ]),
    );
    await findToast("Job enabled");
    await expectDisabledBadges({ [jobA.id]: false, [jobB.id]: false });

    // disable Job B from the detail page
    await userEvent.click(await findRow(jobB.id));
    await waitFor(() =>
      expect(router?.location.pathname).toBe(Urls.transformJob(jobB.id)),
    );
    const header = await screen.findByTestId("jobs-header");
    expect(within(header).getByDisplayValue("Job B")).toBeInTheDocument();
    await userEvent.click(within(header).getByLabelText("Job options"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable$/ }),
    );
    await waitFor(() =>
      expect(getJobUpdateRequests().slice(2)).toEqual([
        { id: jobB.id, body: { active: false } },
      ]),
    );
    await findToast("Job disabled");
    const editor = screen.getByTestId("transforms-job-editor");
    expect(await within(editor).findByText("Disabled")).toBeInTheDocument();

    // re-enable Job B from the detail page
    await userEvent.click(within(header).getByLabelText("Job options"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Re-enable$/ }),
    );
    await waitFor(() =>
      expect(getJobUpdateRequests().slice(3)).toEqual([
        { id: jobB.id, body: { active: true } },
      ]),
    );
    await waitFor(() =>
      expect(within(editor).queryByText("Disabled")).not.toBeInTheDocument(),
    );

    await userEvent.click(within(header).getByRole("link", { name: "Jobs" }));
    await waitFor(() =>
      expect(router?.location.pathname).toBe(Urls.transformJobList()),
    );

    // bulk-disable: canceling the modal does not fire the mutation
    await openBulkActionsMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable all$/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(getBulkUpdateRequestBodies()).toEqual([]);
    await expectDisabledBadges({ [jobA.id]: false, [jobB.id]: false });

    // bulk-disable: confirming sends { active: false } and badges every row
    await openBulkActionsMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable all$/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Disable all",
      }),
    );
    await waitFor(() =>
      expect(getBulkUpdateRequestBodies()).toEqual([{ active: false }]),
    );
    await expectDisabledBadges({ [jobA.id]: true, [jobB.id]: true });

    // mixed state: the bulk menu shows both items, then bulk-re-enable
    await clickRowMenuItem(jobB.id, "Re-enable");
    await waitFor(() =>
      expect(getJobUpdateRequests().slice(4)).toEqual([
        { id: jobB.id, body: { active: true } },
      ]),
    );
    await expectDisabledBadges({ [jobA.id]: true, [jobB.id]: false });
    await openBulkActionsMenu();
    expect(
      await screen.findByRole("menuitem", { name: /Disable all$/ }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("menuitem", { name: /Re-enable all$/ }),
    );
    await waitFor(() =>
      expect(getBulkUpdateRequestBodies().slice(1)).toEqual([{ active: true }]),
    );
    await expectDisabledBadges({ [jobA.id]: false, [jobB.id]: false });
  });
});
