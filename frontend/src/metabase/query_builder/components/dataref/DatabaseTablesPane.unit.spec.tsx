import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { checkNotNull } from "metabase/lib/types";
import {
  createMockDatabase,
  createMockSearchResult,
} from "metabase-types/api/mocks";

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
  it("should show tables with initial_sync_status='incomplete' as non-interactive (disabled)", async () => {
    setup({
      searchResults: [incompleteTableSearchResult],
    });

    const textElement = screen.getByText(
      checkNotNull(incompleteTableSearchResult.table_name),
    );

    expect(textElement).toBeInTheDocument();
    await expectToBeDisabled(textElement);
  });

  it("should show tables with initial_sync_status='aborted' as non-interactive (disabled)", async () => {
    setup({
      searchResults: [abortedTableSearchResult],
    });

    const textElement = screen.getByText(
      checkNotNull(abortedTableSearchResult.table_name),
    );

    expect(textElement).toBeInTheDocument();
    await expectToBeDisabled(textElement);
  });

  it("should show tables with initial_sync_status='complete' as interactive (enabled)", async () => {
    setup({
      searchResults: [completeTableSearchResult],
    });

    const textElement = screen.getByText(
      checkNotNull(completeTableSearchResult.table_name),
    );

    expect(textElement).toBeInTheDocument();
    await expectToBeEnabled(textElement);
  });
});

/**
 * We're dealing with <a> here, which are presented as disabled thanks to:
 * - not having "href" attribute
 * - using "pointer-events: none"
 *
 * Due to this "expect().toBeDisabled()" and "expect().toBeEnabled()" won't work as expected.
 *
 * Clicking the element allows us to detect interactiveness (being enabled/disabled) with certainty.
 */
async function expectToBeDisabled(element: Element) {
  await expect(userEvent.click(element)).rejects.toThrow(
    /pointer-events: none/,
  );
}

/**
 * @see expectToBeDisabled
 */
async function expectToBeEnabled(element: Element) {
  await expect(userEvent.click(element)).resolves.not.toThrow();
}
