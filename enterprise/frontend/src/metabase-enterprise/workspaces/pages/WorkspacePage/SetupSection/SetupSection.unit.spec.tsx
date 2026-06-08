import userEvent from "@testing-library/user-event";

import { setupListWorkspaceInstancesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceInstance,
} from "metabase-types/api/mocks";

import { SetupSection } from "./SetupSection";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

function setup({
  workspace = createMockWorkspace(),
  instances = [] as WorkspaceInstance[],
}: { workspace?: Workspace; instances?: WorkspaceInstance[] } = {}) {
  setupListWorkspaceInstancesEndpoint(instances);
  renderWithProviders(<SetupSection workspace={workspace} />);
}

describe("SetupSection", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("offers an inline config.yml download link that tracks an event", async () => {
    const workspace = createMockWorkspace();
    setup({ workspace });

    const link = await screen.findByRole("link", { name: "config.yml" });
    expect(link).toHaveAttribute(
      "href",
      `/api/ee/workspace-manager/${workspace.id}/config`,
    );

    await userEvent.click(link);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "workspaces_config_downloaded",
      target_id: workspace.id,
    });
  });

  it("disables 'Set up an instance' with a tooltip when no instance is free", async () => {
    setup({ instances: [createMockWorkspaceInstance({ workspace_id: 5 })] });

    const button = await screen.findByRole("button", {
      name: "Set up an instance",
    });
    expect(button).toBeDisabled();

    await userEvent.hover(button);
    expect(
      await screen.findByText("Register a development instance first."),
    ).toBeInTheDocument();
  });

  it("enables 'Set up an instance' when a free instance exists", async () => {
    setup({ instances: [createMockWorkspaceInstance({ workspace_id: null })] });

    expect(
      await screen.findByRole("button", { name: "Set up an instance" }),
    ).toBeEnabled();
  });

  it("shows 'Reset the instance' when the workspace already has an instance", async () => {
    setup({
      workspace: createMockWorkspace({
        workspace_instance: createMockWorkspaceInstance({ id: 7 }),
      }),
    });

    expect(
      await screen.findByRole("button", { name: "Reset the instance" }),
    ).toBeInTheDocument();
  });
});
