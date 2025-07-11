import {
  setupDatabasesEndpoints,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";

const setup = (database: Partial<Database>) => {
  const db = createMockDatabase(database);

  setupUserAttributesEndpoint(["cool_guy", "boss_gal"]);
  setupDatabasesEndpoints([db]);

  renderWithProviders(<DatabaseRoutingSection database={db} />, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

describe("DatabaseRoutingSection", () => {
  it("should render DatabaseRoutingSection", () => {
    setup({ engine: "postgres", features: ["database-routing"] });

    expect(screen.getByText("Database routing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "When someone views a question using data from this database, Metabase will send the queries to the destination database set by the person's user attribute. Each destination database must have identical schemas.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Enable database routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable database routing")).toBeEnabled();
  });

  it("should render DatabaseRoutingSection with custom db_routing_info", () => {
    setup({
      engine: "bigquery-cloud-sdk",
      features: ["database-routing"],
      db_routing_info:
        "Route queries on this database to a different BigQuery project or Google Cloud account based on the person's user attribute. Each BigQuery destination must have identical schemas.",
    });

    expect(screen.getByText("Database routing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Route queries on this database to a different BigQuery project or Google Cloud account based on the person's user attribute. Each BigQuery destination must have identical schemas.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Enable database routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable database routing")).toBeEnabled();
  });

  it("should hide section if database is attached DWH", () => {
    setup({
      engine: "postgres",
      is_attached_dwh: true,
      features: ["database-routing"],
    });

    expect(screen.queryByText("Database routing")).not.toBeInTheDocument();
  });

  it("should hide section if database is sample", () => {
    setup({
      engine: "postgres",
      is_sample: true,
      features: ["database-routing"],
    });

    expect(screen.queryByText("Database routing")).not.toBeInTheDocument();
  });

  it("should hide section if database routing is not supported by the db engine", async () => {
    setup({ engine: "clickhouse", features: [] });
    expect(screen.queryByText("Database routing")).not.toBeInTheDocument();
  });
});
