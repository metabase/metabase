import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupDatabaseAnonymousReachEndpoint,
  setupDatabasesEndpoints,
  setupEnginesEndpoint,
  setupListTransformsEndpoint,
  setupUserAttributesEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  AnonymouslyReachingEntity,
  Database,
  DatabaseAnonymousReach,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockDatabaseAnonymousReach,
  createMockEngine,
  createMockEngines,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabaseRoutingSection } from "./DatabaseRoutingSection";

const ROUTER_UPDATE_ERROR = "Could not update database routing";

const routingCapableDatabase = (overrides: Partial<Database> = {}): Database =>
  createMockDatabase({
    engine: "postgres",
    features: ["database-routing"],
    ...overrides,
  });

const routedDatabase = (overrides: Partial<Database> = {}): Database =>
  routingCapableDatabase({ router_user_attribute: "cool_guy", ...overrides });

const reachingEntity = (
  overrides: Partial<AnonymouslyReachingEntity> = {},
): AnonymouslyReachingEntity => ({
  id: 11,
  model: "dashboard",
  name: "Quarterly revenue",
  surfaces: ["public-link"],
  ...overrides,
});

/** `total` is exact while `data` is capped server-side, so the two are given separately. */
const reachServing = (
  data: AnonymouslyReachingEntity[],
  total: number = data.length,
): DatabaseAnonymousReach => ({ total, data });

/** The reachability fact arrives asynchronously, and absence before it lands means nothing. */
const waitForReachabilityFact = () =>
  waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets.some(({ url }) => url.includes("anonymous-reach"))).toBe(true);
  });

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
  routerUpdateStatus?: number;
  anonymouslyReachable?: boolean;
}

const setup = ({
  database = createMockDatabase(),
  isAdmin = true,
  routerUpdateStatus = 200,
  anonymouslyReachable = false,
}: SetupOpts = {}) => {
  setupUserAttributesEndpoint(["cool_guy", "boss_gal"]);
  setupDatabasesEndpoints([database]);
  setupDatabaseAnonymousReachEndpoint(
    database,
    createMockDatabaseAnonymousReach(
      anonymouslyReachable ? reachServing([reachingEntity()]) : undefined,
    ),
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

describe("DatabaseRoutingSection anonymous reachability warning", () => {
  const HAVE_STOPPED = "This database has stopped serving anonymous visitors";
  const REMEDY = "To start serving them again, allow anonymous access below.";
  const ROUTED_QUERIES_NOTE =
    "In guest embeds and public links, database queries will always be routed to the router database.";
  const NOTHING_REACHABLE_REASSURANCE = "No public links use this database.";

  const findWarning = () => screen.findByRole("alert", { name: HAVE_STOPPED });
  const queryWarning = () =>
    screen.queryByRole("alert", { name: HAVE_STOPPED });

  it("should say it has already stopped serving them, and name the remedy", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    const warning = await findWarning();
    expect(warning).toHaveTextContent(REMEDY);
    expect(within(warning).getByLabelText("warning icon")).toBeInTheDocument();
    expect(
      within(warning).queryByLabelText("info icon"),
    ).not.toBeInTheDocument();
    // its one row leaves nothing unlisted, so there is no count to show beside the list
    expect(warning).not.toHaveTextContent(/\d/);
  });

  it("should not warn about a database whose routing has only just been switched on", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("Enable database routing"));

    // nothing is stored yet, so nothing has stopped
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("should render no alert at all when nothing anonymous reaches the database", async () => {
    setup({
      database: routedDatabase(),
      anonymouslyReachable: false,
    });

    await waitForReachabilityFact();

    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("should not claim anything is broken once anonymous access is granted", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: true }),
      anonymouslyReachable: true,
    });

    await waitForReachabilityFact();

    expect(queryWarning()).not.toBeInTheDocument();
  });

  it("should not warn about a reachable database that is not routed at all", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });

    await waitForReachabilityFact();

    expect(queryWarning()).not.toBeInTheDocument();
  });

  it("should not warn while the section is collapsed", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    expect(await findWarning()).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("chevronup icon"));

    expect(queryWarning()).not.toBeInTheDocument();
  });

  it("should claim nothing until the reachability fact has arrived", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    expect(queryWarning()).not.toBeInTheDocument();

    expect(await findWarning()).toBeInTheDocument();
  });

  it("should carry neither the routed-queries note nor the nothing-reachable reassurance", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    await findWarning();

    expect(screen.queryByText(ROUTED_QUERIES_NOTE)).not.toBeInTheDocument();
    expect(
      screen.queryByText(NOTHING_REACHABLE_REASSURANCE),
    ).not.toBeInTheDocument();
  });
});

describe("DatabaseRoutingSection anonymous access grant", () => {
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

  it("should disable the grant until routing is stored, on a database that was never asked about", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: false,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("Enable database routing"));

    expect(
      await screen.findByLabelText("Allow anonymous access"),
    ).toBeDisabled();
  });
});
