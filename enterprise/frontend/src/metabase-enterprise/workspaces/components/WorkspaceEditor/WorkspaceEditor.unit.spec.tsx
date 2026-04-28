import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import type { WorkspaceInfo } from "../../types";

import { WorkspaceEditor } from "./WorkspaceEditor";

type SetupOpts = {
  workspace: WorkspaceInfo;
  databases?: Database[];
};

function setup({ workspace, databases = [] }: SetupOpts) {
  setupDatabaseListEndpoint(databases);
  const onNameChange = jest.fn<void, [string]>();
  const onDatabasesChange = jest.fn<void, [WorkspaceDatabase[]]>();
  renderWithProviders(
    <WorkspaceEditor
      workspace={workspace}
      onNameChange={onNameChange}
      onDatabasesChange={onDatabasesChange}
    />,
    { withRouter: true },
  );
  return { onNameChange, onDatabasesChange };
}

describe("WorkspaceEditor", () => {
  it("should hide the setup section until the workspace is fully provisioned", () => {
    setup({ workspace: createMockWorkspace() });

    expect(
      screen.queryByText("Setup a development instance"),
    ).not.toBeInTheDocument();
  });

  it("should show the setup section when the workspace is fully provisioned", () => {
    setup({
      workspace: createMockWorkspace({
        databases: [createMockWorkspaceDatabase({ status: "provisioned" })],
      }),
    });

    expect(
      screen.getByText("Setup a development instance"),
    ).toBeInTheDocument();
  });
});
