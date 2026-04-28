import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseConfigModal } from "./DatabaseConfigModal";

type SetupOpts = {
  config?: WorkspaceDatabase;
  databases: Database[];
  canRemove?: boolean;
};

function setup({ config, databases, canRemove = true }: SetupOpts) {
  const onSubmit = jest.fn<void, [WorkspaceDatabase]>();
  const onDelete = jest.fn<void, [WorkspaceDatabase]>();
  const onClose = jest.fn<void, []>();
  renderWithProviders(
    <DatabaseConfigModal
      opened
      config={config}
      databases={databases}
      canRemove={canRemove}
      onSubmit={onSubmit}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
  return { onSubmit, onDelete, onClose };
}

describe("DatabaseConfigModal", () => {
  it("should remove an existing config", async () => {
    const config = createMockWorkspaceDatabase();
    const { onDelete } = setup({
      config,
      databases: [
        createMockDatabase({ name: "Postgres", features: ["workspace"] }),
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(config);
  });

  it("should not allow removing the last config", () => {
    setup({
      config: createMockWorkspaceDatabase(),
      databases: [
        createMockDatabase({ name: "Postgres", features: ["workspace"] }),
      ],
      canRemove: false,
    });

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
