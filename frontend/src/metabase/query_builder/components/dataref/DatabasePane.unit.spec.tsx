import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabaseEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import {
  createMockCollection,
  createMockDatabase,
  createMockSearchResult,
  createMockTable,
} from "metabase-types/api/mocks";

import type { DatabasePaneProps } from "./DatabasePane";
import { DatabasePane } from "./DatabasePane";

const mockDatabaseApi = createMockDatabase();
const metadata = createMockMetadata({
  databases: [mockDatabaseApi],
});
const database = checkNotNull(metadata.database(mockDatabaseApi.id));

const incompleteTableSearchResult = createMockSearchResult({
  id: getNextId(),
  table_name: "Incomplete result",
  model: "table",
  initial_sync_status: "incomplete",
});

const abortedTableSearchResult = createMockSearchResult({
  id: getNextId(),
  table_name: "Aborted result",
  model: "table",
  initial_sync_status: "aborted",
});

const completeTableSearchResult = createMockSearchResult({
  id: getNextId(),
  table_name: "Complete result",
  model: "table",
  initial_sync_status: "complete",
});

const defaultProps: DatabasePaneProps = {
  database,
  onBack: jest.fn(),
  onClose: jest.fn(),
  onItemClick: jest.fn(),
};

const setup = (options?: Partial<DatabasePaneProps>) => {
  const props = { ...defaultProps, ...options };
  setupDatabaseEndpoints(mockDatabaseApi);
  setupSearchEndpoints([]);
  return renderWithProviders(<DatabasePane {...props} />);
};

describe("DatabasePane", () => {
  describe("table sync status", () => {
    it("should show tables with initial_sync_status='incomplete' as non-interactive (disabled)", async () => {
      setup();
      setupSearchEndpoints([incompleteTableSearchResult]);

      await waitForLoaderToBeRemoved();

      const textElement = screen.getByText(
        checkNotNull(incompleteTableSearchResult.table_name),
      );

      expect(textElement).toBeInTheDocument();
      expect(textElement).toHaveAttribute("data-disabled", "true");
    });

    it("should show tables with initial_sync_status='aborted' as non-interactive (disabled)", async () => {
      setup();
      setupSearchEndpoints([abortedTableSearchResult]);

      await waitForLoaderToBeRemoved();

      const textElement = screen.getByText(
        checkNotNull(abortedTableSearchResult.table_name),
      );

      expect(textElement).toBeInTheDocument();
      expect(textElement).toHaveAttribute("data-disabled", "true");
    });

    it("should show tables with initial_sync_status='complete' as interactive (enabled)", async () => {
      setup();
      setupSearchEndpoints([completeTableSearchResult]);

      await waitForLoaderToBeRemoved();

      const textElement = screen.getByText(
        checkNotNull(completeTableSearchResult.table_name),
      );

      expect(textElement).toBeInTheDocument();
      await expectToBeEnabled(textElement);
    });

    it("should handle mix of complete, incomplete, and aborted tables in same list", async () => {
      setup();
      setupSearchEndpoints([
        incompleteTableSearchResult,
        abortedTableSearchResult,
        completeTableSearchResult,
      ]);

      await waitForLoaderToBeRemoved();

      const incompleteElement = screen.getByText(
        checkNotNull(incompleteTableSearchResult.table_name),
      );
      const abortedElement = screen.getByText(
        checkNotNull(abortedTableSearchResult.table_name),
      );
      const completeElement = screen.getByText(
        checkNotNull(completeTableSearchResult.table_name),
      );

      expect(incompleteElement).toHaveAttribute("data-disabled", "true");
      expect(abortedElement).toHaveAttribute("data-disabled", "true");
      await expectToBeEnabled(completeElement);
    });
  });

  describe("schema display", () => {
    it("should display flat table list with 'X table(s)' header for single schema", async () => {
      const singleSchemaDb = createMockDatabase({
        id: getNextId(),
        tables: [
          createMockTable({
            id: 1,
            name: "Table 1",
            schema: "public",
            db_id: mockDatabaseApi.id,
          }),
        ],
      });
      const singleSchemaMetadata = createMockMetadata({
        databases: [singleSchemaDb],
      });
      const singleSchemaDatabase = checkNotNull(
        singleSchemaMetadata.database(singleSchemaDb.id),
      );

      const table1 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 1",
        model: "table",
        table_schema: "public",
        initial_sync_status: "complete",
      });

      setup({ database: singleSchemaDatabase });
      setupDatabaseEndpoints(singleSchemaDb);
      setupSearchEndpoints([table1]);

      await waitForLoaderToBeRemoved();

      expect(screen.getByText("1 table")).toBeInTheDocument();
      expect(screen.getByText("Table 1")).toBeInTheDocument();
    });

    it("should display tree grouped by schema with 'x schema(s)' header for multiple schemas", async () => {
      const multiSchemaDb = createMockDatabase({
        id: getNextId(),
        tables: [
          createMockTable({
            id: 1,
            name: "Table 1",
            schema: "public",
            db_id: mockDatabaseApi.id,
          }),
          createMockTable({
            id: 2,
            name: "Table 2",
            schema: "analytics",
            db_id: mockDatabaseApi.id,
          }),
        ],
      });
      const multiSchemaMetadata = createMockMetadata({
        databases: [multiSchemaDb],
      });
      const multiSchemaDatabase = checkNotNull(
        multiSchemaMetadata.database(multiSchemaDb.id),
      );

      const table1 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 1",
        model: "table",
        table_schema: "public",
        initial_sync_status: "complete",
      });
      const table2 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 2",
        model: "table",
        table_schema: "analytics",
        initial_sync_status: "complete",
      });

      setup({ database: multiSchemaDatabase });
      setupDatabaseEndpoints(multiSchemaDb);
      setupSearchEndpoints([table1, table2]);

      await waitForLoaderToBeRemoved();

      expect(screen.getByText("2 tables in 2 schemas")).toBeInTheDocument();
    });

    it("should handle case when no schemas are returned", async () => {
      const emptySchemasDb = createMockDatabase({
        id: getNextId(),
        tables: [],
      });
      const emptySchemasMetadata = createMockMetadata({
        databases: [emptySchemasDb],
      });
      const emptySchemasDatabase = checkNotNull(
        emptySchemasMetadata.database(emptySchemasDb.id),
      );

      setup({ database: emptySchemasDatabase });
      setupDatabaseEndpoints(emptySchemasDb);
      setupSearchEndpoints([]);

      await waitForLoaderToBeRemoved();

      expect(screen.queryByText(/schema/i)).not.toBeInTheDocument();
    });
  });

  describe("tables", () => {
    it("should render multiple tables correctly", async () => {
      const table1 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 1",
        model: "table",
        initial_sync_status: "complete",
      });
      const table2 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 2",
        model: "table",
        initial_sync_status: "complete",
      });
      const table3 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 3",
        model: "table",
        initial_sync_status: "complete",
      });

      setup();
      setupSearchEndpoints([table1, table2, table3]);

      await waitForLoaderToBeRemoved();

      expect(screen.getByText("Table 1")).toBeInTheDocument();
      expect(screen.getByText("Table 2")).toBeInTheDocument();
      expect(screen.getByText("Table 3")).toBeInTheDocument();
      expect(screen.getByText("3 tables")).toBeInTheDocument();
    });

    it("should group tables by schema when multiple schemas exist", async () => {
      const multiSchemaDb = createMockDatabase({
        id: getNextId(),
        tables: [
          createMockTable({
            id: 1,
            name: "Table 1",
            schema: "public",
            db_id: mockDatabaseApi.id,
          }),
          createMockTable({
            id: 2,
            name: "Table 2",
            schema: "analytics",
            db_id: mockDatabaseApi.id,
          }),
        ],
      });
      const multiSchemaMetadata = createMockMetadata({
        databases: [multiSchemaDb],
      });
      const multiSchemaDatabase = checkNotNull(
        multiSchemaMetadata.database(multiSchemaDb.id),
      );

      const table1 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 1",
        model: "table",
        table_schema: "public",
        initial_sync_status: "complete",
      });
      const table2 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 2",
        model: "table",
        table_schema: "analytics",
        initial_sync_status: "complete",
      });

      setup({ database: multiSchemaDatabase });
      setupDatabaseEndpoints(multiSchemaDb);
      setupSearchEndpoints([table1, table2]);

      await waitForLoaderToBeRemoved();
      expect(screen.getByText("2 tables in 2 schemas")).toBeInTheDocument();
    });
  });

  describe("models", () => {
    it("should render models in CollectionsList component", async () => {
      const collection1 = createMockCollection({
        id: 1,
        name: "Collection 1",
      });
      const model1 = createMockSearchResult({
        id: getNextId(),
        name: "Model 1",
        model: "dataset",
        collection: collection1,
      });

      setup();
      setupSearchEndpoints([model1]);

      await waitForLoaderToBeRemoved();

      expect(screen.getByText(/1 model/i)).toBeInTheDocument();

      const collectionText = screen.getByText("Collection 1");
      await userEvent.click(collectionText);
      expect(screen.getByText("Model 1")).toBeInTheDocument();
    });

    it("should group models by collection correctly", async () => {
      const collection1 = createMockCollection({
        id: 1,
        name: "Collection 1",
      });
      const collection2 = createMockCollection({
        id: 2,
        name: "Collection 2",
      });
      const model1 = createMockSearchResult({
        id: getNextId(),
        name: "Model 1",
        model: "dataset",
        collection: collection1,
      });
      const model2 = createMockSearchResult({
        id: getNextId(),
        name: "Model 2",
        model: "dataset",
        collection: collection1,
      });
      const model3 = createMockSearchResult({
        id: getNextId(),
        name: "Model 3",
        model: "dataset",
        collection: collection2,
      });

      setup();
      setupSearchEndpoints([model1, model2, model3]);

      await waitForLoaderToBeRemoved();

      expect(screen.getByText(/3 models/i)).toBeInTheDocument();
      expect(screen.getByText(/2 collections/i)).toBeInTheDocument();

      const collection1Text = screen.getByText("Collection 1");
      await userEvent.click(collection1Text);
      expect(screen.getByText("Model 1")).toBeInTheDocument();
      expect(screen.getByText("Model 2")).toBeInTheDocument();

      const collection2Text = screen.getByText("Collection 2");
      await userEvent.click(collection2Text);
      expect(screen.getByText("Model 3")).toBeInTheDocument();
    });

    it("should return null when no models are present", async () => {
      const table1 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 1",
        model: "table",
        initial_sync_status: "complete",
      });

      setup();
      setupSearchEndpoints([table1]);

      await waitForLoaderToBeRemoved();

      expect(screen.queryByText(/model/i)).not.toBeInTheDocument();
      expect(screen.getByText("Table 1")).toBeInTheDocument();
    });
  });

  describe("user interactions", () => {
    it("should call onItemClick with correct type ('table') and item for tables", async () => {
      const onItemClick = jest.fn();
      const table1 = createMockSearchResult({
        id: getNextId(),
        table_name: "Table 1",
        model: "table",
        initial_sync_status: "complete",
      });

      setup({ onItemClick });
      setupSearchEndpoints([table1]);

      await waitForLoaderToBeRemoved();

      const tableElement = screen.getByText("Table 1");
      await userEvent.click(tableElement);

      expect(onItemClick).toHaveBeenCalledWith("table", table1);
    });

    it("should call onItemClick with correct type ('question') and item for models", async () => {
      const onItemClick = jest.fn();
      const collection1 = createMockCollection({
        id: 1,
        name: "Collection 1",
      });
      const model1 = createMockSearchResult({
        id: getNextId(),
        name: "Model 1",
        model: "dataset",
        collection: collection1,
      });

      setup({ onItemClick });
      setupSearchEndpoints([model1]);

      await waitForLoaderToBeRemoved();

      const collectionText = screen.getByText("Collection 1");
      await userEvent.click(collectionText);

      const modelText = screen.getByText("Model 1");
      await userEvent.click(modelText);

      expect(onItemClick).toHaveBeenCalledWith("question", model1);
    });

    it("should call onBack callback when back button is clicked", async () => {
      const onBack = jest.fn();

      setup({ onBack });
      setupSearchEndpoints([]);

      await waitForLoaderToBeRemoved();

      const backButton = screen.getByTestId("sidebar-header-title");
      await userEvent.click(backButton);

      expect(onBack).toHaveBeenCalled();
    });

    it("should call onClose callback when close button is clicked", async () => {
      const onClose = jest.fn();

      setup({ onClose });
      setupSearchEndpoints([]);

      await waitForLoaderToBeRemoved();

      const closeIcon = screen.getByLabelText("close icon");
      await userEvent.click(closeIcon);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("component structure", () => {
    it("should display database name as SidebarContent title", async () => {
      setup();
      setupSearchEndpoints([]);

      await waitForLoaderToBeRemoved();

      expect(screen.getByText(database.name)).toBeInTheDocument();
    });

    it("should display 'database' icon in SidebarContent", async () => {
      setup();
      setupSearchEndpoints([]);

      await waitForLoaderToBeRemoved();

      const sidebarHeader = screen.getByTestId("sidebar-header");
      expect(sidebarHeader).toBeInTheDocument();
      expect(screen.getByText(database.name)).toBeInTheDocument();
    });
  });
});

async function expectToBeEnabled(element: Element) {
  await expect(userEvent.click(element)).resolves.not.toThrow();
}
