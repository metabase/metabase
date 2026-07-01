import { setupUsersEndpoints } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
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
  users?: UserListResult[];
};

function setup({ indexes = [], users = [] }: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 600 });
  setupUsersEndpoints(users);

  renderWithProviders(<TransformIndexTable indexes={indexes} />);
}

describe("TransformIndexTable", () => {
  it("renders the column headers", async () => {
    setup({ indexes: [createMockTableIndexEntry()] });

    for (const header of [
      "Name",
      "Type",
      "Columns",
      "Source",
      "Status",
      "Last modified by",
      "Last run",
    ]) {
      expect(await screen.findByText(header)).toBeInTheDocument();
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

    expect(await screen.findByText("idx_orders")).toBeInTheDocument();
    expect(screen.getByText("gin")).toBeInTheDocument();
    expect(screen.getByText("total, created_at")).toBeInTheDocument();
  });

  it("falls back to the index kind when the index has no name", async () => {
    setup({
      indexes: [createMockTableIndexEntry({ name: null, kind: "distkey" })],
    });

    const table = await screen.findByRole("treegrid", {
      name: "Transform indexes",
    });
    // The kind shows in both the Name (fallback) and Type columns.
    expect(within(table).getAllByText("distkey")).toHaveLength(2);
  });

  it("labels metabase-managed indexes as 'Managed'", async () => {
    setup({
      indexes: [createMockTableIndexEntry({ metabase_managed: true })],
    });

    expect(await screen.findByText("Managed")).toBeInTheDocument();
  });

  it("labels non-managed indexes as 'Unmanaged'", async () => {
    setup({
      indexes: [createMockTableIndexEntry({ metabase_managed: false })],
    });

    expect(await screen.findByText("Unmanaged")).toBeInTheDocument();
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

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Removing")).toBeInTheDocument();
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

    expect(await screen.findByText("Never")).toBeInTheDocument();
  });
});
