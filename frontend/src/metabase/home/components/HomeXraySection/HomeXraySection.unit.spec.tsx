import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createMockDatabase,
  createMockDatabaseCandidate,
  createMockTableCandidate,
} from "metabase-types/api/mocks";
import { Database, DatabaseCandidate } from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import HomeXraySection from "./HomeXraySection";

interface SetupOpts {
  database: Database;
  candidates: DatabaseCandidate[];
}

const setup = ({ database, candidates }: SetupOpts) => {
  const state = createMockState({
    entities: createMockEntitiesState({ databases: [database] }),
  });
  const metadata = getMetadata(state);

  renderWithProviders(
    <HomeXraySection
      database={checkNotNull(metadata.database(database.id))}
      candidates={candidates}
    />,
    {
      storeInitialState: state,
    },
  );
};

describe("HomeXraySection", () => {
  it("should show x-rays for a sample database", () => {
    setup({
      database: createMockDatabase({
        is_sample: true,
      }),
      candidates: [
        createMockDatabaseCandidate({
          tables: [
            createMockTableCandidate({ title: "Orders" }),
            createMockTableCandidate({ title: "People" }),
          ],
        }),
      ],
    });

    expect(screen.getByText(/Try out these sample x-rays/)).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
  });

  it("should show x-rays for a user database", () => {
    setup({
      database: createMockDatabase({
        name: "H2",
        is_sample: false,
      }),
      candidates: [
        createMockDatabaseCandidate({
          schema: "public",
          tables: [createMockTableCandidate({ title: "Orders" })],
        }),
        createMockDatabaseCandidate({
          schema: "internal",
          tables: [createMockTableCandidate({ title: "People" })],
        }),
      ],
    });

    expect(screen.getByText(/Here are some explorations/)).toBeInTheDocument();
    expect(screen.getByText("H2")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("People")).not.toBeInTheDocument();
  });
});
