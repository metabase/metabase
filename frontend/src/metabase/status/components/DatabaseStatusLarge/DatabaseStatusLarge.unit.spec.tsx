import { render, screen } from "__support__/ui-minimal";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseStatusLarge } from "./DatabaseStatusLarge";

interface SetupOpts {
  databases: Database[];
}

const setup = ({ databases }: SetupOpts) => {
  render(<DatabaseStatusLarge databases={databases} />);
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
});
