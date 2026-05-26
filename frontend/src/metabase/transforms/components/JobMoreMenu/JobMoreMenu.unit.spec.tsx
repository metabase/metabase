import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupUpdateTransformJobEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { TransformJob } from "metabase-types/api";
import { createMockTransformJob } from "metabase-types/api/mocks";

import { JobMoreMenu } from "./JobMoreMenu";

function setup({
  job = createMockTransformJob(),
}: { job?: TransformJob } = {}) {
  setupUpdateTransformJobEndpoint(job);
  renderWithProviders(<JobMoreMenu job={job} />);
  return { job };
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button"));
}

describe("JobMoreMenu", () => {
  it("shows 'Disable' when the job is enabled", async () => {
    setup({ job: createMockTransformJob({ active: true }) });
    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: /Disable/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Re-enable/ }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Re-enable' when the job is disabled", async () => {
    setup({ job: createMockTransformJob({ active: false }) });
    await openMenu();
    expect(
      await screen.findByRole("menuitem", { name: /Re-enable/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Disable/ }),
    ).not.toBeInTheDocument();
  });

  it("calls the update mutation with active: false when disabling", async () => {
    const { job } = setup({ job: createMockTransformJob({ active: true }) });
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disable/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.lastCall(`path:/api/transform-job/${job.id}`, {
          method: "PUT",
        }),
      ).toBeDefined();
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/transform-job/${job.id}`,
      { method: "PUT" },
    );
    expect(await call?.request?.json()).toEqual({ active: false });
  });

  it("calls the update mutation with active: true when enabling", async () => {
    const { job } = setup({ job: createMockTransformJob({ active: false }) });
    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Re-enable/ }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.lastCall(`path:/api/transform-job/${job.id}`, {
          method: "PUT",
        }),
      ).toBeDefined();
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/transform-job/${job.id}`,
      { method: "PUT" },
    );
    expect(await call?.request?.json()).toEqual({ active: true });
  });
});
