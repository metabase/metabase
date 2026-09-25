import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseStatusLarge } from "./DatabaseStatusLarge";

interface SetupOpts {
  databases: Database[];
}

const setup = ({ databases }: SetupOpts) => {
  renderWithProviders(<DatabaseStatusLarge databases={databases} />);
};

describe("DatabaseStatusLarge", () => {
  it("should render in-progress status", () => {
    setup({
      databases: [
        createMockDatabase({
          id: 1,
          initial_sync_status: "incomplete",
        }),
        createMockDatabase({
          id: 2,
          initial_sync_status: "complete",
        }),
      ],
    });

    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    expect(screen.getByText("Syncing tables…")).toBeInTheDocument();
  });

  it("should render the cause of an aborted sync (GHY-3856)", () => {
    setup({
      databases: [
        createMockDatabase({
          id: 1,
          initial_sync_status: "aborted",
          initial_sync_error:
            "User is not authorized to perform: glue:GetDatabases",
        }),
      ],
    });

    expect(screen.getByText("Error syncing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sync failed: User is not authorized to perform: glue:GetDatabases",
      ),
    ).toBeInTheDocument();
  });

  it("should render a generic message for an aborted sync with no recorded cause", () => {
    setup({
      databases: [
        createMockDatabase({ id: 1, initial_sync_status: "aborted" }),
      ],
    });

    expect(screen.getByText("Sync failed")).toBeInTheDocument();
  });
});
