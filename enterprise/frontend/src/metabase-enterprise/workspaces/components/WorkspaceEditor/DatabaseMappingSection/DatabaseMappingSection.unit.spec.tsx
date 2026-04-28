import userEvent from "@testing-library/user-event";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspace,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import type { WorkspaceInfo } from "../../../types";

import { DatabaseMappingSection } from "./DatabaseMappingSection";

type SetupOpts = {
  workspace: WorkspaceInfo;
  databases: Database[];
};

function setup({ workspace, databases }: SetupOpts) {
  setupDatabaseListEndpoint(databases);
  const onChange = jest.fn<void, [WorkspaceDatabase[]]>();
  renderWithProviders(
    <DatabaseMappingSection workspace={workspace} onChange={onChange} />,
  );
  return { onChange };
}

describe("DatabaseMappingSection", () => {
  it("should disable deleting the last database mapping", async () => {
    const database = createMockDatabase({
      name: "Postgres",
      features: ["workspace", "schemas"],
    });
    setup({
      workspace: createMockWorkspace({
        databases: [createMockWorkspaceDatabase()],
      }),
      databases: [database],
    });

    await userEvent.click(await screen.findByText("Postgres"));
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
  });
});
