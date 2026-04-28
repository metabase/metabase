import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";
import {
  createMockDatabase,
  createMockWorkspaceDatabase,
} from "metabase-types/api/mocks";

import { DatabaseMappingModal } from "./DatabaseMappingModal";

type SetupOpts = {
  mapping?: WorkspaceDatabase;
  databases: Database[];
  canRemove?: boolean;
};

function setup({ mapping, databases, canRemove = true }: SetupOpts) {
  const onSubmit = jest.fn<void, [WorkspaceDatabase]>();
  const onDelete = jest.fn<void, [WorkspaceDatabase]>();
  const onClose = jest.fn<void, []>();
  renderWithProviders(
    <DatabaseMappingModal
      opened
      mapping={mapping}
      databases={databases}
      canRemove={canRemove}
      onSubmit={onSubmit}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
  return { onSubmit, onDelete, onClose };
}

describe("DatabaseMappingModal", () => {
  it("should remove an existing mapping", async () => {
    const mapping = createMockWorkspaceDatabase();
    const { onDelete } = setup({
      mapping,
      databases: [
        createMockDatabase({ name: "Postgres", features: ["workspace"] }),
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith(mapping);
  });

  it("should not allow removing the last mapping", () => {
    setup({
      mapping: createMockWorkspaceDatabase(),
      databases: [
        createMockDatabase({ name: "Postgres", features: ["workspace"] }),
      ],
      canRemove: false,
    });

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
