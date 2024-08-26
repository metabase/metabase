import {
  setupDatabaseCandidatesEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Database, DatabaseXray } from "metabase-types/api";
import {
  createMockDatabase,
  createMockDatabaseCandidate,
  createMockTableCandidate,
} from "metabase-types/api/mocks";

import { HomeXraySection } from "./HomeXraySection";

interface SetupOpts {
  database: Database;
  candidates: DatabaseXray[];
}

const setup = async ({ database, candidates }: SetupOpts) => {
  setupDatabasesEndpoints([database]);
  setupDatabaseCandidatesEndpoint(database.id, candidates);
  renderWithProviders(<HomeXraySection />);
  await waitForLoaderToBeRemoved();
};

describe("HomeXraySection", () => {
  it("should show x-rays for a sample database", async () => {
    await setup({
      database: createMockDatabase({
        is_sample: true,
      }),
      candidates: [
        createMockDatabaseCandidate({
          tables: [
            createMockTableCandidate({ title: "Orders", url: "/auto/1" }),
            createMockTableCandidate({ title: "People", url: "/auto/2" }),
          ],
        }),
      ],
    });

    expect(screen.getByText(/Try out these sample x-rays/)).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
  });

  it("should show x-rays for a user database", async () => {
    await setup({
      database: createMockDatabase({
        name: "H2",
        is_sample: false,
      }),
      candidates: [
        createMockDatabaseCandidate({
          id: "1/public",
          schema: "public",
          tables: [createMockTableCandidate({ title: "Orders" })],
        }),
        createMockDatabaseCandidate({
          id: "1/internal",
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
