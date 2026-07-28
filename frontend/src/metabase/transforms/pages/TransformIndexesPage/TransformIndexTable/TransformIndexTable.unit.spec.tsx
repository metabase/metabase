import userEvent from "@testing-library/user-event";

import { setupUsersEndpoints } from "__support__/server-mocks";
import {
  getIcon,
  mockGetBoundingClientRect,
  queryIcon,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { TableIndexEntry, UserListResult } from "metabase-types/api";
import {
  createMockTableIndexEntry,
  createMockTableIndexRequest,
  createMockUserListResult,
} from "metabase-types/api/mocks";

import { TransformIndexTable } from "./TransformIndexTable";

type SetupOpts = {
  indexes?: TableIndexEntry[];
  kindLabels?: Map<string, string>;
  users?: UserListResult[];
  readOnly?: boolean;
};

function setup({
  indexes = [],
  kindLabels = new Map(),
  users = [],
  readOnly = false,
}: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupUsersEndpoints(users);

  const onEdit = jest.fn();
  const onDelete = jest.fn();
  renderWithProviders(
    <TransformIndexTable
      indexes={indexes}
      kindLabels={kindLabels}
      readOnly={readOnly}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );

  return { onEdit, onDelete };
}

describe("TransformIndexTable", () => {
  it("renders the column headers", async () => {
    setup({ indexes: [createMockTableIndexEntry()] });
    await waitForLoaderToBeRemoved();

    for (const header of [
      "Name",
      "Type",
      "Columns",
      "Source",
      "Status",
      "Last modified by",
      "Last run",
    ]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it("renders the index name, type and columns", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: "idx_orders",
          kind: "gin",
          key_columns: ["total", "created_at"],
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("idx_orders")).toBeInTheDocument();
    expect(screen.getByText("gin")).toBeInTheDocument();
    expect(screen.getByText("total, created_at")).toBeInTheDocument();
  });

  it("shows the driver-provided label for the index kind, falling back to the raw kind", async () => {
    setup({
      kindLabels: new Map([["btree", "B-Tree"]]),
      indexes: [
        createMockTableIndexEntry({ name: "idx_btree", kind: "btree" }),
        createMockTableIndexEntry({ name: "idx_gin", kind: "gin" }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("B-Tree")).toBeInTheDocument();
    expect(screen.getByText("gin")).toBeInTheDocument();
  });

  it("falls back to the index kind when the index has no name", async () => {
    setup({
      indexes: [createMockTableIndexEntry({ name: null, kind: "distkey" })],
    });
    await waitForLoaderToBeRemoved();

    const table = screen.getByRole("treegrid", {
      name: "Transform indexes",
    });
    // The kind shows in both the Name (fallback) and Type columns.
    expect(within(table).getAllByText("distkey")).toHaveLength(2);
  });

  it("labels metabase-managed indexes as 'Managed'", async () => {
    setup({
      indexes: [createMockTableIndexEntry({ metabase_managed: true })],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Managed")).toBeInTheDocument();
  });

  it("labels non-managed indexes as 'Unmanaged'", async () => {
    setup({
      indexes: [createMockTableIndexEntry({ metabase_managed: false })],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Unmanaged")).toBeInTheDocument();
  });

  it("formats the request status", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          name: "idx_pending",
          request: createMockTableIndexRequest({
            id: 1,
            status: "create-pending",
          }),
        }),
        createMockTableIndexEntry({
          name: "idx_removing",
          request: createMockTableIndexRequest({
            id: 2,
            status: "delete-pending",
          }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Removing")).toBeInTheDocument();
  });

  it("shows an info tooltip for pending statuses", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          request: createMockTableIndexRequest({ status: "create-pending" }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Pending")).toBeInTheDocument();
    await userEvent.hover(getIcon("info_outline"));
    expect(
      await screen.findByText(
        "Changes will be applied the next time the transform runs",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the pending info icon for terminal statuses", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          request: createMockTableIndexRequest({
            status: "succeeded",
            error_message: null,
          }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(queryIcon("info_outline")).not.toBeInTheDocument();
  });

  it("resolves the last modified by user name", async () => {
    setup({
      users: [createMockUserListResult({ id: 7, common_name: "Ed Winters" })],
      indexes: [
        createMockTableIndexEntry({
          request: createMockTableIndexRequest({ created_by: 7 }),
        }),
      ],
    });

    expect(await screen.findByText("Ed Winters")).toBeInTheDocument();
  });

  it("shows 'Never' when the index has not been run", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          request: createMockTableIndexRequest({ last_executed_at: null }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("offers edit and delete for a managed index with a request", async () => {
    const index = createMockTableIndexEntry({
      metabase_managed: true,
      request: createMockTableIndexRequest({ id: 5 }),
    });
    const { onEdit, onDelete } = setup({ indexes: [index] });
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("button", { name: "Index actions" }),
    );
    await userEvent.click(await screen.findByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "btree" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Index actions" }),
    );
    await userEvent.click(await screen.findByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ name: "btree" }),
    );
  });

  it("opens the editor only when clicking an editable managed index row", async () => {
    const managed = createMockTableIndexEntry({
      name: "idx_managed",
      metabase_managed: true,
      request: createMockTableIndexRequest({ id: 5 }),
    });
    const unmanaged = createMockTableIndexEntry({
      name: "idx_unmanaged",
      metabase_managed: false,
      request: undefined,
    });
    const removing = createMockTableIndexEntry({
      name: "idx_removing",
      metabase_managed: true,
      request: createMockTableIndexRequest({ id: 6, status: "delete-pending" }),
    });
    const { onEdit } = setup({ indexes: [managed, unmanaged, removing] });
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByText("idx_unmanaged"));
    await userEvent.click(screen.getByText("idx_removing"));
    expect(onEdit).not.toHaveBeenCalled();

    // opening the row menu must not bubble into a row click
    const managedRow = screen.getByRole("row", { name: /idx_managed/ });
    await userEvent.click(
      within(managedRow).getByRole("button", { name: "Index actions" }),
    );
    expect(await screen.findByText("Edit")).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(screen.getByText("idx_managed"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "idx_managed" }),
    );
  });

  it("does not open the editor when clicking a row in read-only mode", async () => {
    const index = createMockTableIndexEntry({
      name: "idx_readonly",
      metabase_managed: true,
      request: createMockTableIndexRequest({ id: 5 }),
    });
    const { onEdit } = setup({ indexes: [index], readOnly: true });
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByText("idx_readonly"));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("does not offer a menu for unmanaged indexes", async () => {
    setup({
      indexes: [
        createMockTableIndexEntry({
          metabase_managed: false,
          request: undefined,
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Unmanaged")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Index actions" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the actions column when read-only", async () => {
    setup({
      readOnly: true,
      indexes: [
        createMockTableIndexEntry({
          metabase_managed: true,
          request: createMockTableIndexRequest({ id: 5 }),
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Managed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Index actions" }),
    ).not.toBeInTheDocument();
  });
});
