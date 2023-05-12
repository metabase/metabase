import React from "react";
import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import DatabaseStatusLarge from "./DatabaseStatusLarge";

interface SetupOpts {
  databases: Database[];
}

const setup = ({ databases }: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases }),
  });
  const metadata = getMetadata(state);

  renderWithProviders(
    <DatabaseStatusLarge
      databases={databases.map(({ id }) => checkNotNull(metadata.database(id)))}
    />,
    { storeInitialState: state },
  );
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
