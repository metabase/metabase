import userEvent from "@testing-library/user-event";
import {
  setupDatabaseEndpoints,
  setupTableEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { InitialSyncStatus } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";
import { SearchResult } from "metabase/search/components/SearchResult";
import { createWrappedSearchResult } from "metabase/search/components/SearchResult/tests/util";

interface SetupOpts {
  name: string;
  initial_sync_status: InitialSyncStatus;
}

const setup = (setupOpts: SetupOpts) => {
  const TEST_TABLE = createMockTable(setupOpts);
  const TEST_DATABASE = createMockDatabase();
  setupTableEndpoints(TEST_TABLE);
  setupDatabaseEndpoints(TEST_DATABASE);
  setupUsersEndpoints([createMockUser()]);
  const result = createWrappedSearchResult({
    model: "table",
    table_id: TEST_TABLE.id,
    database_id: TEST_DATABASE.id,
    getUrl: () => `/table/${TEST_TABLE.id}`,
    getIcon: () => ({ name: "table" }),
    ...setupOpts,
  });

  const onClick = jest.fn();
  renderWithProviders(<SearchResult result={result} onClick={onClick} />);
  const link = screen.getByText(result.name);
  return { link, onClick };
};

describe("SearchResult > Tables", () => {
  it("tables with initial_sync_status='complete' are clickable", () => {
    const { link, onClick } = setup({
      name: "Complete Table",
      initial_sync_status: "complete",
    });
    userEvent.click(link);
    expect(onClick).toHaveBeenCalled();
  });

  it("tables with initial_sync_status='incomplete' are not clickable", () => {
    const { link, onClick } = setup({
      name: "Incomplete Table",
      initial_sync_status: "incomplete",
    });
    userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("tables with initial_sync_status='aborted' are not clickable", () => {
    const { link, onClick } = setup({
      name: "Aborted Table",
      initial_sync_status: "aborted",
    });
    userEvent.click(link);
    expect(onClick).not.toHaveBeenCalled();
  });
});
