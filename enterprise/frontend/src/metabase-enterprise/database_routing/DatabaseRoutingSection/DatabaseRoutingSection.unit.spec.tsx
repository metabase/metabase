import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupDatabaseUsageInfoEndpoint,
  setupDatabasesEndpoints,
  setupEnginesEndpoint,
  setupListTransformsEndpoint,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { Database } from "metabase-types/api";
import {
  createMockDatabase,
  createMockDatabaseUsageInfo,
  createMockEngine,
  createMockEngines,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";

const ROUTER_UPDATE_ERROR = "Could not update database routing";

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
  routerUpdateStatus?: number;
  publicLinkCount?: number;
}

const setup = ({
  database = createMockDatabase(),
  isAdmin = true,
  routerUpdateStatus = 200,
  publicLinkCount = 0,
}: SetupOpts = {}) => {
  setupUserAttributesEndpoint(["cool_guy", "boss_gal"]);
  setupDatabasesEndpoints([database]);
  setupDatabaseUsageInfoEndpoint(
    database,
    createMockDatabaseUsageInfo({ public_link: publicLinkCount }),
  );
  fetchMock.put(
    "express:/api/ee/database-routing/router-database/:id",
    routerUpdateStatus === 200
      ? 200
      : { status: routerUpdateStatus, body: { message: ROUTER_UPDATE_ERROR } },
  );
  setupListTransformsEndpoint([]);
  setupEnginesEndpoint(
    createMockEngines({
      "bigquery-cloud-sdk": createMockEngine({
        "driver-name": "Big Query",
        "extra-info": {
          "db-routing-info": {
            text: "custom db routing info.",
          },
        },
      }),
    }),
  );

  renderWithProviders(<DatabaseRoutingSection database={database} />, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: createMockSettingsState(createMockSettings()),
    },
    withUndos: true,
  });
};

describe("DatabaseRoutingSection", () => {
  it("should render DatabaseRoutingSection", () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
      }),
    });

    expect(screen.getByText("Database routing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "When someone views a question using data from this database, Metabase will send the queries to the destination database set by the person's user attribute. Each destination database must have identical schemas.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Enable database routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable database routing")).toBeEnabled();
  });

  it("should render DatabaseRoutingSection with custom db_routing_info", async () => {
    setup({
      database: createMockDatabase({
        engine: "bigquery-cloud-sdk",
        features: ["database-routing"],
      }),
    });

    expect(screen.getByText("Database routing")).toBeInTheDocument();
    expect(
      await screen.findByText("custom db routing info."),
    ).toBeInTheDocument();
    expect(screen.getByText("Enable database routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable database routing")).toBeEnabled();
  });

  it("should hide section if database is attached DWH", () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        is_attached_dwh: true,
        features: ["database-routing"],
      }),
    });

    expect(screen.queryByText("Database routing")).not.toBeInTheDocument();
  });

  it("should hide section if database is sample", () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        is_sample: true,
        features: ["database-routing"],
      }),
    });

    expect(screen.queryByText("Database routing")).not.toBeInTheDocument();
  });

  it("should hide section if database routing is not supported by the db engine", async () => {
    setup({
      database: createMockDatabase({ engine: "clickhouse", features: [] }),
    });
    expect(screen.queryByText("Database routing")).not.toBeInTheDocument();
  });

  it("should let a non-admin with database management permission view but not change routing settings", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: "cool_guy",
      }),
      isAdmin: false,
    });

    expect(screen.getByText("Database routing")).toBeInTheDocument();
    expect(screen.getByLabelText("Enable database routing")).toBeDisabled();
    expect(
      await screen.findByTestId("db-routing-user-attribute"),
    ).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Add/ })).not.toBeInTheDocument();
  });

  it("should let an admin change routing settings", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: "cool_guy",
      }),
    });

    expect(screen.getByLabelText("Enable database routing")).toBeEnabled();
    expect(
      await screen.findByTestId("db-routing-user-attribute"),
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: /Add/ })).toBeInTheDocument();
  });

  it("should show a warning when writable connection is enabled", () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        write_data_details: { host: "localhost" },
      }),
    });

    expect(
      screen.getByText(
        "Database routing can't be enabled when a Writable Connection is enabled.",
      ),
    ).toBeInTheDocument();
  });
});

describe("DatabaseRoutingSection affected public links", () => {
  const ROUTING_NOTE =
    "In guest embeds and public links, database queries will always be routed to the router database.";

  it("should count the affected public questions while routing is being enabled", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: null,
      }),
      publicLinkCount: 4,
    });

    await userEvent.click(screen.getByLabelText("Enable database routing"));

    expect(await screen.findByText(ROUTING_NOTE)).toBeInTheDocument();
    expect(
      await screen.findByText(
        "This affects 4 public questions on this database, and any public dashboard that uses it.",
      ),
    ).toBeInTheDocument();
  });

  it("should count a single affected public question in the singular", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: "cool_guy",
      }),
      publicLinkCount: 1,
    });

    expect(
      await screen.findByText(
        "This affects 1 public question on this database, and any public dashboard that uses it.",
      ),
    ).toBeInTheDocument();
  });

  it("should still describe public dashboards when no public question is affected", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: "cool_guy",
      }),
      publicLinkCount: 0,
    });

    expect(await screen.findByText(ROUTING_NOTE)).toBeInTheDocument();
    expect(
      await screen.findByText(
        "This affects any public dashboard that uses this database.",
      ),
    ).toBeInTheDocument();
  });

  it("should not mention public links while the section is collapsed", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: null,
      }),
      publicLinkCount: 4,
    });

    expect(await screen.findByText("Database routing")).toBeInTheDocument();
    expect(screen.queryByText(ROUTING_NOTE)).not.toBeInTheDocument();
  });
});

describe("DatabaseRoutingSection anonymous access grant", () => {
  const routedDatabase = (overrides: Partial<Database> = {}): Database =>
    createMockDatabase({
      engine: "postgres",
      features: ["database-routing"],
      router_user_attribute: "cool_guy",
      ...overrides,
    });

  it("should render the grant as an unchecked toggle when it is not granted", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: false }),
    });

    expect(
      await screen.findByLabelText("Allow anonymous access"),
    ).not.toBeChecked();
  });

  it("should render the grant as a checked toggle when it is granted", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: true }),
    });

    expect(
      await screen.findByLabelText("Allow anonymous access"),
    ).toBeChecked();
  });

  it("should grant anonymous access alongside the stored user attribute", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: false }),
    });

    await userEvent.click(
      await screen.findByLabelText("Allow anonymous access"),
    );

    const puts = await findRequests("PUT");
    const [{ url, body }] = puts.slice(-1);
    expect(url).toMatch(/\/api\/ee\/database-routing\/router-database\/\d+$/);
    expect(body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: true,
    });
  });

  it("should revoke anonymous access", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: true }),
    });

    await userEvent.click(
      await screen.findByLabelText("Allow anonymous access"),
    );

    const puts = await findRequests("PUT");
    const [{ body }] = puts.slice(-1);
    expect(body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
  });

  it("should confirm a successful change with a toast", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: false }),
    });

    await userEvent.click(
      await screen.findByLabelText("Allow anonymous access"),
    );

    expect(
      await screen.findByText("Anonymous access allowed"),
    ).toBeInTheDocument();
  });

  it("should not claim success when the request fails", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: false }),
      routerUpdateStatus: 400,
    });

    await userEvent.click(
      await screen.findByLabelText("Allow anonymous access"),
    );

    expect(await screen.findByText(ROUTER_UPDATE_ERROR)).toBeInTheDocument();
    expect(
      screen.queryByText("Anonymous access allowed"),
    ).not.toBeInTheDocument();
  });

  it("should not let a non-admin change the grant", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: true }),
      isAdmin: false,
    });

    expect(
      await screen.findByLabelText("Allow anonymous access"),
    ).toBeDisabled();
  });

  it("should disable the grant until routing is enabled", async () => {
    setup({
      database: createMockDatabase({
        engine: "postgres",
        features: ["database-routing"],
        router_user_attribute: null,
      }),
    });

    await userEvent.click(screen.getByLabelText("Enable database routing"));

    expect(
      await screen.findByLabelText("Allow anonymous access"),
    ).toBeDisabled();
  });
});
