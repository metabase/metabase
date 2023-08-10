import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import { getNextId } from "__support__/utils";
import {
  createMockDatabase,
  createMockSearchResult,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";

import type { DatabaseTablesPaneProps } from "./DatabaseTablesPane";
import { DatabaseTablesPane } from "./DatabaseTablesPane";

const database = createMockDatabase();

const metadata = createMockMetadata({
  databases: [database],
});

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

const defaultProps = {
  database: checkNotNull(metadata.database(database.id)),
  searchResults: [],
  onBack: jest.fn(),
  onClose: jest.fn(),
  onItemClick: jest.fn(),
};

const setup = (options?: Partial<DatabaseTablesPaneProps>) => {
  return renderWithProviders(
    <DatabaseTablesPane {...defaultProps} {...options} />,
  );
};

describe("DatabaseTablesPane", () => {
  it("should show tables with initial_sync_status='incomplete' as non-interactive", () => {
    setup({
      searchResults: [incompleteTableSearchResult],
    });

    const searchResultElement = screen.getByText(
      checkNotNull(incompleteTableSearchResult.table_name),
    );

    expect(searchResultElement).toBeInTheDocument();
    expect(() => {
      userEvent.click(searchResultElement);
    }).toThrow();
  });

  it("should show tables with initial_sync_status='aborted' as non-interactive", () => {
    setup({
      searchResults: [abortedTableSearchResult],
    });

    const searchResultElement = screen.getByText(
      checkNotNull(abortedTableSearchResult.table_name),
    );

    expect(searchResultElement).toBeInTheDocument();
    expect(() => {
      userEvent.click(searchResultElement);
    }).toThrow();
  });

  it("should show tables with initial_sync_status='complete' as interactive", () => {
    setup({
      searchResults: [completeTableSearchResult],
    });

    const searchResultElement = screen.getByText(
      checkNotNull(completeTableSearchResult.table_name),
    );

    expect(searchResultElement).toBeInTheDocument();
    expect(() => {
      userEvent.click(searchResultElement);
    }).not.toThrow();
  });
});
