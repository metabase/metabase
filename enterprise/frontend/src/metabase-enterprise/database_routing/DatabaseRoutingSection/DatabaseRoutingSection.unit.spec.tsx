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
import { waitForRequestsToSettle } from "__support__/utils";
import { defer } from "metabase/utils/promise";
import type {
  AnonymouslyReachableEntity,
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
  overrides: Partial<AnonymouslyReachableEntity> = {},
): AnonymouslyReachableEntity => ({
  id: 11,
  model: "dashboard",
  name: "Quarterly revenue",
  surfaces: ["public-link"],
  reaches_indirectly: false,
  ...overrides,
});

/** `data` is capped server-side; `total` is not. */
const reachServing = (
  data: AnonymouslyReachableEntity[],
  total: number = data.length,
): DatabaseAnonymousReach => ({ total, data });

/** Absence means nothing until the reach response has rendered. */
const waitForReachabilityFact = async () => {
  await waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets.some(({ url }) => url.includes("anonymous-reach"))).toBe(true);
  });
  await waitForRequestsToSettle();
};

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
  routerUpdateStatus?: number;
  anonymouslyReachable?: boolean;
  /** Hold the anonymous-reach response until the test releases it, so a click can get in first. */
  holdReach?: boolean;
}

const setup = ({
  database = createMockDatabase(),
  isAdmin = true,
  routerUpdateStatus = 200,
  anonymouslyReachable = false,
  holdReach = false,
}: SetupOpts = {}) => {
  setupUserAttributesEndpoint(["cool_guy", "boss_gal"]);
  setupDatabasesEndpoints([database]);
  const anonymousReach = createMockDatabaseAnonymousReach(
    anonymouslyReachable ? reachServing([reachingEntity()]) : undefined,
  );
  const heldReach = defer<DatabaseAnonymousReach>();
  setupDatabaseAnonymousReachEndpoint(
    database,
    holdReach ? heldReach.promise : anonymousReach,
  );
  const releaseReach = () => heldReach.resolve(anonymousReach);
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

  const utils = renderWithProviders(
    <DatabaseRoutingSection database={database} />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: isAdmin }),
        settings: createMockSettingsState(createMockSettings()),
      },
      withUndos: true,
    },
  );

  return { ...utils, releaseReach };
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

  it("should not claim success when saving the user attribute fails", async () => {
    setup({ database: routedDatabase(), routerUpdateStatus: 400 });

    await userEvent.click(
      await screen.findByTestId("db-routing-user-attribute"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "boss_gal" }),
    );

    expect(await screen.findByText(ROUTER_UPDATE_ERROR)).toBeInTheDocument();
    expect(
      screen.queryByText("Database routing updated"),
    ).not.toBeInTheDocument();
  });

  it("should send nothing when routing is switched off before anything is stored", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
    });

    await userEvent.click(screen.getByLabelText("Enable database routing"));
    await userEvent.click(screen.getByLabelText("Enable database routing"));
    await waitForRequestsToSettle();

    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should confirm switching stored routing off with a toast", async () => {
    setup({ database: routedDatabase() });

    await userEvent.click(screen.getByLabelText("Enable database routing"));

    expect(
      await screen.findByText("Database routing disabled"),
    ).toBeInTheDocument();
  });

  it("should not claim routing was disabled when the request fails", async () => {
    setup({ database: routedDatabase(), routerUpdateStatus: 400 });

    await userEvent.click(screen.getByLabelText("Enable database routing"));
    await waitFor(async () =>
      expect(await findRequests("PUT")).toHaveLength(1),
    );
    await waitForRequestsToSettle();

    expect(
      screen.queryByText("Database routing disabled"),
    ).not.toBeInTheDocument();
  });
});

describe("DatabaseRoutingSection anonymous reachability warning", () => {
  const HAVE_STOPPED = "This database has stopped serving anonymous visitors";
  const REMEDY = "To start serving them again, allow anonymous access below.";

  const findWarning = () => screen.findByRole("alert", { name: HAVE_STOPPED });
  const queryWarning = () =>
    screen.queryByRole("alert", { name: HAVE_STOPPED });

  it("should say it has already stopped serving them, and name the remedy", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    const warning = await findWarning();
    expect(warning).toHaveTextContent(REMEDY);
    expect(within(warning).getByLabelText("warning icon")).toBeInTheDocument();
  });

  it("should not warn about a database whose routing has only just been switched on", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("Enable database routing"));

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

  it("should not warn while the section is collapsed", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    expect(await findWarning()).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("chevronup icon"));

    expect(queryWarning()).not.toBeInTheDocument();
  });

  it("should claim nothing until the reachability fact has arrived", async () => {
    const { releaseReach } = setup({
      database: routedDatabase(),
      anonymouslyReachable: true,
      holdReach: true,
    });

    expect(
      await screen.findByTestId("db-routing-user-attribute"),
    ).toBeEnabled();
    expect(queryWarning()).not.toBeInTheDocument();

    releaseReach();

    expect(await findWarning()).toBeInTheDocument();
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
