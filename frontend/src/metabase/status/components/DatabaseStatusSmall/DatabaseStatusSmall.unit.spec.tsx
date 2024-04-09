import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import DatabaseStatusSmall from "./DatabaseStatusSmall";

interface SetupOpts {
  databases: Database[];
}

const setup = ({ databases }: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
  });
  const metadata = getMetadata(state);

  renderWithProviders(
    <DatabaseStatusSmall
      databases={databases.map(({ id }) => checkNotNull(metadata.database(id)))}
    />,
    { storeInitialState: state },
  );
};

describe("DatabaseStatusSmall", () => {
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

    expect(screen.getByLabelText("Syncing database…")).toBeInTheDocument();
  });

  it("should render complete status", () => {
    setup({
      databases: [
        createMockDatabase({
          id: 1,
          initial_sync_status: "complete",
        }),
        createMockDatabase({
          id: 2,
          initial_sync_status: "complete",
        }),
      ],
    });

    expect(screen.getByLabelText("Done!")).toBeInTheDocument();
  });

  it("should render error status", () => {
    setup({
      databases: [
        createMockDatabase({
          id: 1,
          initial_sync_status: "aborted",
        }),
        createMockDatabase({
          id: 2,
          initial_sync_status: "complete",
        }),
      ],
    });

    expect(screen.getByLabelText("Error syncing")).toBeInTheDocument();
  });
});
