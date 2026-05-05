import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupBulkUpdateTransformJobsActiveEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { JobListMoreMenu } from "./JobListMoreMenu";

function setup({ jobs }: { jobs: TransformJob[] }) {
  setupBulkUpdateTransformJobsActiveEndpoint(jobs.length);
  renderWithProviders(<JobListMoreMenu jobs={jobs} />);
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button"));
}

async function expectBulkPut(active: boolean) {
  await waitFor(() => {
    expect(
      fetchMock.callHistory.lastCall("path:/api/transform-job/active", {
        method: "PUT",
      }),
    ).toBeDefined();
  });
  const call = fetchMock.callHistory.lastCall(
    "path:/api/transform-job/active",
    { method: "PUT" },
  );
  expect(await call?.request?.json()).toEqual({ active });
}

describe("JobListMoreMenu", () => {
  it("shows only 'Disable all' when every job is enabled", async () => {
    setup({
      jobs: [
        createMockTransformJob({ id: 1, active: true }),
        createMockTransformJob({ id: 2, active: true }),
      ],
    });
    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: /Disable all/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Re-enable all/ }),
    ).not.toBeInTheDocument();
  });

  it("shows only 'Re-enable all' when every job is disabled", async () => {
    setup({
      jobs: [
        createMockTransformJob({ id: 1, active: false }),
        createMockTransformJob({ id: 2, active: false }),
      ],
    });
    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: /Re-enable all/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Disable all/ }),
    ).not.toBeInTheDocument();
  });

  it("shows both items in mixed state", async () => {
    setup({
      jobs: [
        createMockTransformJob({ id: 1, active: true }),
        createMockTransformJob({ id: 2, active: false }),
      ],
    });
    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: /Disable all/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Re-enable all/ }),
    ).toBeInTheDocument();
  });

  it("re-enables all jobs immediately without a confirmation modal", async () => {
    setup({ jobs: [createMockTransformJob({ id: 1, active: false })] });
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Re-enable all/ }),
    );

    await expectBulkPut(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables all jobs only after confirming the modal", async () => {
    setup({ jobs: [createMockTransformJob({ id: 1, active: true })] });
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable all/ }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Disable all jobs?" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.lastCall("path:/api/transform-job/active", {
        method: "PUT",
      }),
    ).toBeUndefined();

    await userEvent.click(screen.getByRole("button", { name: "Disable all" }));
    await expectBulkPut(false);
  });

  it("does not fire the bulk mutation when the modal is canceled", async () => {
    setup({ jobs: [createMockTransformJob({ id: 1, active: true })] });
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable all/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      fetchMock.callHistory.lastCall("path:/api/transform-job/active", {
        method: "PUT",
      }),
    ).toBeUndefined();
  });
});
