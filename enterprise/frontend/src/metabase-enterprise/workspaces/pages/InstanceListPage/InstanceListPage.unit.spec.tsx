import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceInstanceEndpoint,
  setupDeleteWorkspaceInstanceEndpoint,
  setupListWorkspaceInstancesEndpoint,
  setupListWorkspacesEndpoint,
  setupTestWorkspaceInstanceConnectionEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceInstance,
} from "metabase-types/api/mocks";

import { InstanceListPage } from "./InstanceListPage";

function setup({
  instances = [] as WorkspaceInstance[],
  workspaces = [] as Workspace[],
} = {}) {
  setupListWorkspaceInstancesEndpoint(instances);
  setupListWorkspacesEndpoint(workspaces);

  renderWithProviders(<Route path="*" component={InstanceListPage} />, {
    withRouter: true,
  });
}

describe("InstanceListPage", () => {
  it("from the empty state, connects an instance through the modal", async () => {
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

    const freeItem = await screen.findByRole("region", {
      name: "Free instance",
    });
    expect(freeItem).toBeInTheDocument();
    expect(
      screen.getByText(/Available for a workspace · not set up yet/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Used by the workspace "The workspace"/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Instance options" }),
    ).toHaveLength(2);
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
