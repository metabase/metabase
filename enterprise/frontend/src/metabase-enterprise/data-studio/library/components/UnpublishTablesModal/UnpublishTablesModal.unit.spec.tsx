import userEvent from "@testing-library/user-event";

import {
  setupTableSelectionInfoEndpoint,
  setupUnpublishTablesEndpoint,
  setupUnpublishTablesEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  BulkTableSelectionInfo,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";
import {
  createMockBulkTableInfo,
  createMockBulkTableSelectionInfo,
} from "metabase-types/api/mocks";

import { UnpublishTablesModal } from "./UnpublishTablesModal";

type SetupOpts = {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
  selectionInfo?: BulkTableSelectionInfo;
  hasUnpublishError?: boolean;
};

function setup({
  databaseIds,
  schemaIds,
  tableIds,
  selectionInfo = createMockBulkTableSelectionInfo(),
  hasUnpublishError,
}: SetupOpts = {}) {
  const onUnpublish = jest.fn();
  const onClose = jest.fn();

  setupTableSelectionInfoEndpoint(selectionInfo);
  if (hasUnpublishError) {
    setupUnpublishTablesEndpointError();
  } else {
    setupUnpublishTablesEndpoint();
  }

  renderWithProviders(
    <UnpublishTablesModal
      databaseIds={databaseIds}
      schemaIds={schemaIds}
      tableIds={tableIds}
      isOpened
      onUnpublish={onUnpublish}
      onClose={onClose}
    />,
  );

  return { onUnpublish, onClose };
}

describe("UnpublishTablesModal", () => {
  it("should be able to unpublish a single table", async () => {
    const { onUnpublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: createMockBulkTableInfo({
          id: 1,
          display_name: "Orders",
        }),
      }),
    });
    expect(await screen.findByText("Unpublish Orders?")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Unpublish this table"));
    await waitFor(() => expect(onUnpublish).toHaveBeenCalled());
  });

  it("should be able to unpublish a single table with remapped tables", async () => {
    const { onUnpublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: createMockBulkTableInfo({
          id: 1,
          display_name: "Products",
        }),
        published_downstream_tables: [
          createMockBulkTableInfo({
            id: 2,
            display_name: "Orders",
          }),
        ],
      }),
    });
    expect(
      await screen.findByText(
        "Unpublish Products and the tables that depend on it?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Unpublish these tables"));
    await waitFor(() => expect(onUnpublish).toHaveBeenCalled());
  });

  it("should be able to unpublish multiple tables", async () => {
    const { onUnpublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: null,
      }),
    });
    expect(
      await screen.findByText("Unpublish these tables?"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText("Unpublish these tables"));
    await waitFor(() => expect(onUnpublish).toHaveBeenCalled());
  });

  it("should be able to unpublish multiple tables with remapped tables", async () => {
    const { onUnpublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: null,
        published_downstream_tables: [
          createMockBulkTableInfo({
            id: 2,
            display_name: "Orders",
          }),
        ],
      }),
    });
    expect(
      await screen.findByText(
        "Unpublish these tables and the tables that depend on them?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Unpublish these tables"));
    await waitFor(() => expect(onUnpublish).toHaveBeenCalled());
  });

  it("should show a unpublish error", async () => {
    const { onUnpublish } = setup({
      selectionInfo: createMockBulkTableSelectionInfo({
        selected_table: createMockBulkTableInfo({
          id: 1,
          display_name: "Orders",
        }),
      }),
      hasUnpublishError: true,
    });
    expect(await screen.findByText("Unpublish Orders?")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Unpublish this table"));
    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(onUnpublish).not.toHaveBeenCalled();
  });
});
