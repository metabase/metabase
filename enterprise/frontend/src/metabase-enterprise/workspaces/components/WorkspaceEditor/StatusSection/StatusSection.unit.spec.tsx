import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDeprovisionWorkspaceEndpoint,
  setupProvisionWorkspaceEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Workspace } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { StatusSection } from "./StatusSection";

type SetupOpts = {
  workspace: Workspace;
};

function setup({ workspace }: SetupOpts) {
  setupProvisionWorkspaceEndpoint(workspace.id);
  setupDeprovisionWorkspaceEndpoint(workspace.id);
  renderWithProviders(<StatusSection workspace={workspace} />);
}

describe("StatusSection", () => {
  it("should provision an unprovisioned workspace", async () => {
    const workspace = createMockWorkspace();
    setup({ workspace });

    expect(
      screen.getByText("This workspace is not provisioned yet."),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Provision workspace" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Provision workspace" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace/${workspace.id}/provision`,
          { method: "POST" },
        ),
      ).toBe(true),
    );
  });

  it("should deprovision a fully provisioned workspace", async () => {
    const workspace = createMockWorkspace({
      databases: [createMockWorkspaceDatabase({ status: "provisioned" })],
    });
    setup({ workspace });

    expect(
      screen.getByText("This workspace is provisioned and ready to use."),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Deprovision workspace" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deprovision workspace" }),
    );

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/workspace/${workspace.id}/deprovision`,
          { method: "POST" },
        ),
      ).toBe(true),
    );
  });
});
