import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateWorkspaceEndpoint,
  setupGetWorkspaceEndpoint,
  setupProvisionWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { Database, Workspace } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
} from "metabase-types/api/mocks";

import { CreateModal } from "./CreateModal";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

type SetupOpts = {
  workspace?: Workspace;
  databases?: Database[];
};

const DATABASE = createMockDatabase({ id: 10, name: "Postgres" });
const DATABASE_2 = createMockDatabase({ id: 20, name: "MySQL" });

function setup({
  workspace = createMockWorkspace({ name: "Brand new workspace" }),
  databases = [DATABASE, DATABASE_2],
}: SetupOpts = {}) {
  const onClose = jest.fn();

  setupCreateWorkspaceEndpoint(workspace);
  setupGetWorkspaceEndpoint(workspace);
  setupProvisionWorkspaceEndpoint(workspace);

  renderWithProviders(
    <>
      <CreateModal databases={databases} opened onClose={onClose} />
      <UndoListing />
    </>,
  );

  return { onClose, workspace };
}

async function submitForm() {
  await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
  await userEvent.click(screen.getByRole("checkbox", { name: "Postgres" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Create workspace" }),
  );
}

function provisionUrl(workspace: Workspace) {
  return `path:/api/ee/workspace-manager/${workspace.id}/provision`;
}

describe("CreateModal", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("creates a workspace and starts provisioning", async () => {
    const { workspace } = setup({
      workspace: createMockWorkspace({
        name: "Brand new workspace",
        status: "database-provisioning",
      }),
    });

    await submitForm();

    expect(
      await screen.findByText("Setting up databases…"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Provision" })).toBeDisabled();
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(provisionUrl(workspace), {
          method: "POST",
        }),
      ).toBe(true);
    });
  });

  it("shows the success step with the instance link once provisioned", async () => {
    const { onClose } = setup({
      workspace: createMockWorkspace({
        name: "Brand new workspace",
        status: "provisioned",
        instance_url: "https://workspace.example.com",
      }),
    });

    await submitForm();

    expect(
      await screen.findByText("The workspace is ready."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://workspace.example.com" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows failure details and allows to provision again", async () => {
    const { workspace } = setup({
      workspace: createMockWorkspace({
        name: "Brand new workspace",
        status: "database-provisioning-failure",
        status_details: "warehouse down",
      }),
    });

    await submitForm();

    expect(
      await screen.findByText("Failed to set up databases"),
    ).toBeInTheDocument();
    expect(await screen.findByText("warehouse down")).toBeInTheDocument();
    const closeButton = screen
      .getAllByRole("button", { name: "Close" })
      .find((button) => button.textContent === "Close");
    expect(closeButton).toBeInTheDocument();

    const provisionButton = screen.getByRole("button", { name: "Provision" });
    await waitFor(() => expect(provisionButton).toBeEnabled());
    await userEvent.click(provisionButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(provisionUrl(workspace), {
          method: "POST",
        }),
      ).toHaveLength(2);
    });
  });

  it("preselects the database when it is the only one available", () => {
    setup({ databases: [DATABASE] });

    expect(screen.getByRole("checkbox", { name: "Postgres" })).toBeChecked();
  });

  it("preselects nothing when several databases are available", () => {
    setup();

    expect(
      screen.getByRole("checkbox", { name: "Postgres" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "MySQL" })).not.toBeChecked();
  });

  it("requires at least one database", async () => {
    setup();

    await userEvent.type(screen.getByLabelText("Name"), "Brand new workspace");
    await userEvent.click(
      screen.getByRole("button", { name: "Create workspace" }),
    );

    expect(
      fetchMock.callHistory.called("path:/api/ee/workspace-manager", {
        method: "POST",
      }),
    ).toBe(false);
  });

  it("tracks an analytics event when a workspace is created", async () => {
    const { workspace } = setup();

    await submitForm();

    await waitFor(() =>
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "workspaces_new_created",
        target_id: workspace.id,
      }),
    );
  });
});
