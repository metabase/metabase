import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceInstanceEndpoint,
  setupDeleteWorkspaceInstanceEndpoint,
  setupListWorkspaceInstancesEndpoint,
  setupListWorkspacesEndpoint,
  setupTestWorkspaceInstanceConnectionEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceInstance,
} from "metabase-types/api/mocks";

import { WorkspacesSettingsPage } from "./WorkspacesSettingsPage";

function setup({
  instances = [] as WorkspaceInstance[],
  workspaces = [] as Workspace[],
} = {}) {
  // TreeTable virtualizes rows, so the container needs a measurable size
  mockGetBoundingClientRect({ width: 800, height: 600 });
  setupListWorkspaceInstancesEndpoint(instances);
  setupListWorkspacesEndpoint(workspaces);

  renderWithProviders(<WorkspacesSettingsPage />);
}

describe("WorkspacesSettingsPage", () => {
  it("connects an instance through the modal", async () => {
    setup();
    setupCreateWorkspaceInstanceEndpoint(
      createMockWorkspaceInstance({ name: "Dev child" }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Connect an instance/i }),
    );

    await userEvent.type(await screen.findByLabelText("Name"), "Dev child");
    await userEvent.type(
      screen.getByLabelText("URL"),
      "https://child.example.com",
    );
    await userEvent.type(screen.getByLabelText(/API key/), "mb_secret");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/workspace-manager/instance",
          {
            method: "POST",
          },
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/workspace-manager/instance",
      { method: "POST" },
    );
    expect(await call?.request?.json()).toEqual({
      name: "Dev child",
      url: "https://child.example.com",
      api_key: "mb_secret",
    });
  });

  it("tests the connection with the form values", async () => {
    setup();
    setupTestWorkspaceInstanceConnectionEndpoint({ ok: true });

    await userEvent.click(
      await screen.findByRole("button", { name: /Connect an instance/i }),
    );

    const testButton = await screen.findByRole("button", {
      name: "Test connection",
    });
    expect(testButton).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("URL"),
      "https://child.example.com",
    );
    await userEvent.type(screen.getByLabelText(/API key/), "mb_secret");
    await userEvent.click(testButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/workspace-manager/instance/test",
        ),
      ).toBe(true);
    });
    const call = fetchMock.callHistory.lastCall(
      "path:/api/ee/workspace-manager/instance/test",
    );
    expect(await call?.request?.json()).toEqual({
      url: "https://child.example.com",
      api_key: "mb_secret",
    });
  });

  it("lists instances with their workspace assignment and a menu", async () => {
    setup({
      instances: [
        createMockWorkspaceInstance({ id: 1, name: "Free instance" }),
        createMockWorkspaceInstance({
          id: 2,
          name: "Busy instance",
          workspace_id: 42,
          initialized_at: "2026-01-01T00:00:00Z",
        }),
      ],
      workspaces: [createMockWorkspace({ id: 42, name: "The workspace" })],
    });

    const freeRow = await screen.findByRole("row", { name: "Free instance" });
    expect(within(freeRow).getByText("Available")).toBeInTheDocument();
    expect(within(freeRow).getByText("Not set up yet")).toBeInTheDocument();

    const busyRow = screen.getByRole("row", { name: "Busy instance" });
    expect(within(busyRow).getByText("The workspace")).toBeInTheDocument();
    expect(
      within(busyRow).queryByText("Not set up yet"),
    ).not.toBeInTheDocument();

    expect(
      screen.getAllByRole("button", { name: "Instance options" }),
    ).toHaveLength(2);
  });

  it("opens the edit modal when a row is clicked", async () => {
    setup({
      instances: [createMockWorkspaceInstance({ id: 1, name: "Dev child" })],
    });

    await userEvent.click(
      await screen.findByRole("row", { name: "Dev child" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Edit this instance?" }),
    ).toBeInTheDocument();
  });

  it("disconnects an instance from the menu", async () => {
    setup({
      instances: [createMockWorkspaceInstance({ id: 1, name: "Doomed" })],
    });
    setupDeleteWorkspaceInstanceEndpoint(1);

    await userEvent.click(
      await screen.findByRole("button", { name: "Instance options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Disconnect/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/workspace-manager/instance/1",
          { method: "DELETE" },
        ),
      ).toBe(true);
    });
  });
});
