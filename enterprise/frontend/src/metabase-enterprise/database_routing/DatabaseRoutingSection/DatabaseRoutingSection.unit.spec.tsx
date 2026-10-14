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

const reachingEntities = (count: number): AnonymouslyReachingEntity[] =>
  Array.from({ length: count }, (_unused, index) =>
    reachingEntity({ id: index + 1, name: `Published thing ${index + 1}` }),
  );

/** The reachability fact arrives asynchronously, and absence before it lands means nothing. */
const waitForReachabilityFact = () =>
  waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets.some(({ url }) => url.includes("anonymous-reach"))).toBe(true);
  });

const QUESTION = "Keep serving anonymous visitors?";

const findQuestion = () => screen.findByRole("dialog", { name: QUESTION });
const queryQuestion = () => screen.queryByRole("dialog", { name: QUESTION });

const answerQuestion = async (
  answer: "Keep serving them" | "Stop serving them",
) =>
  userEvent.click(
    within(await findQuestion()).getByRole("button", { name: answer }),
  );

/** Switch routing on and answer the question it raises, which sends nothing on its own. */
const enableRoutingAndAnswer = async (
  answer: "Keep serving them" | "Stop serving them",
) => {
  await userEvent.click(screen.getByLabelText("Enable database routing"));
  await answerQuestion(answer);
};

const pickUserAttribute = async (attribute: string) => {
  await userEvent.click(await screen.findByTestId("db-routing-user-attribute"));
  await userEvent.click(await screen.findByRole("option", { name: attribute }));
};

interface SetupOpts {
  database?: Database;
  isAdmin?: boolean;
  routerUpdateStatus?: number;
  anonymouslyReachable?: boolean;
  reach?: DatabaseAnonymousReach;
  /** Hold the anonymous-reach response until the test releases it, so a click can get in first. */
  holdReach?: boolean;
  reachStatus?: number;
}

const setup = ({
  database = createMockDatabase(),
  isAdmin = true,
  routerUpdateStatus = 200,
  anonymouslyReachable = false,
  reach,
  holdReach = false,
  reachStatus = 200,
}: SetupOpts = {}) => {
  setupUserAttributesEndpoint(["cool_guy", "boss_gal"]);
  setupDatabasesEndpoints([database]);
  const anonymousReach =
    reach ??
    createMockDatabaseAnonymousReach(
      anonymouslyReachable ? reachServing([reachingEntity()]) : undefined,
    );
  let releaseReach = () => {};
  if (holdReach) {
    const held = new Promise<void>((resolve) => {
      releaseReach = resolve;
    });
    fetchMock.get(
      `path:/api/database/${database.id}/anonymous-reach`,
      async () => {
        await held;
        return anonymousReach;
      },
    );
  } else if (reachStatus !== 200) {
    fetchMock.get(
      `path:/api/database/${database.id}/anonymous-reach`,
      reachStatus,
    );
  } else {
    setupDatabaseAnonymousReachEndpoint(database, anonymousReach);
  }
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

    await enableRoutingAndAnswer("Stop serving them");

    // the question at the toggle has already put this decision to the admin
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(
      screen.queryByText(/will stop serving anonymous visitors/),
    ).not.toBeInTheDocument();
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

describe("DatabaseRoutingSection anonymous access question at the toggle", () => {
  it("should ask before sending anything when routing is switched on for a reachable database", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("Enable database routing"));

    expect(await findQuestion()).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should return the toggle to off and send nothing when the question is cancelled", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("Enable database routing"));
    await userEvent.click(
      within(await findQuestion()).getByRole("button", { name: "Cancel" }),
    );

    expect(queryQuestion()).not.toBeInTheDocument();
    expect(screen.getByLabelText("Enable database routing")).not.toBeChecked();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should send the answer and the user attribute as one request", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await pickUserAttribute("cool_guy");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: true,
    });
  });

  it("should show the pending answer on the Allow anonymous access switch", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");

    const grant = await screen.findByLabelText("Allow anonymous access");
    expect(grant).toBeChecked();
    // sitting disabled would read as though the question had never been asked
    expect(grant).toBeEnabled();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should discard the pending answer when routing is switched back off", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();
    const routingToggle = screen.getByLabelText("Enable database routing");

    await userEvent.click(routingToggle);
    await answerQuestion("Keep serving them");
    await userEvent.click(routingToggle);
    await userEvent.click(routingToggle);

    expect(screen.getByLabelText("Allow anonymous access")).not.toBeChecked();
    // and the question comes back, because there is nothing held to answer it
    expect(await findQuestion()).toBeInTheDocument();
  });

  it("should send a declined answer explicitly, rather than leaving it to the default", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Stop serving them");
    await pickUserAttribute("cool_guy");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
  });

  it("should change nothing server-side when the admin answers and then leaves", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");

    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should let the admin revise the pending answer on the switch without sending it", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await userEvent.click(screen.getByLabelText("Allow anonymous access"));
    await pickUserAttribute("cool_guy");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
  });

  it("should not ask about a database nothing anonymous reaches", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: false,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("Enable database routing"));
    await pickUserAttribute("cool_guy");

    expect(queryQuestion()).not.toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({ user_attribute: "cool_guy" });
  });

  it("should not re-send the answer once the router already carries it", async () => {
    const database = routingCapableDatabase({ router_user_attribute: null });
    const { rerender } = setup({ database, anonymouslyReachable: true });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await pickUserAttribute("cool_guy");

    rerender(
      <DatabaseRoutingSection
        database={routingCapableDatabase({
          router_user_attribute: "cool_guy",
          router_anonymous_access_granted: true,
        })}
      />,
    );
    await pickUserAttribute("boss_gal");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual({ user_attribute: "boss_gal" });
  });

  it("should still ask when the toggle beats the reachability fact", async () => {
    const { releaseReach } = setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
      holdReach: true,
    });

    await userEvent.click(screen.getByLabelText("Enable database routing"));
    expect(queryQuestion()).not.toBeInTheDocument();

    releaseReach();

    expect(await findQuestion()).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should keep the answer for a retry when the combined request fails", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
      routerUpdateStatus: 400,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await pickUserAttribute("cool_guy");
    expect(await screen.findByText(ROUTER_UPDATE_ERROR)).toBeInTheDocument();

    await pickUserAttribute("boss_gal");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual({
      user_attribute: "boss_gal",
      anonymous_access_granted: true,
    });
    expect(queryQuestion()).not.toBeInTheDocument();
  });

  it("should ask when the attribute is reached through the chevron, not the toggle", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("chevrondown icon"));
    expect(queryQuestion()).not.toBeInTheDocument();

    await pickUserAttribute("cool_guy");

    expect(await findQuestion()).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should store the chevron-reached attribute and the answer as one request", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("chevrondown icon"));
    await pickUserAttribute("cool_guy");
    await answerQuestion("Keep serving them");

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: true,
    });
  });

  it("should send nothing when the chevron-reached question is cancelled", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(screen.getByLabelText("chevrondown icon"));
    await pickUserAttribute("cool_guy");
    await userEvent.click(
      within(await findQuestion()).getByRole("button", { name: "Cancel" }),
    );

    expect(queryQuestion()).not.toBeInTheDocument();
    // the chevron's disclosure was the admin's own, so it survives
    expect(screen.getByLabelText("Allow anonymous access")).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should not write to a database that has no router when the toggle goes back off", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();
    const routingToggle = screen.getByLabelText("Enable database routing");

    await enableRoutingAndAnswer("Keep serving them");
    await userEvent.click(routingToggle);

    expect(routingToggle).not.toBeChecked();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should still turn a stored router off", async () => {
    setup({ database: routedDatabase(), anonymouslyReachable: true });

    await userEvent.click(
      await screen.findByLabelText("Enable database routing"),
    );

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({ user_attribute: null });
    expect(
      await screen.findByText("Database routing disabled"),
    ).toBeInTheDocument();
  });

  it("should not claim routing was enabled when the combined request fails", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
      routerUpdateStatus: 400,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await pickUserAttribute("cool_guy");

    expect(await screen.findByText(ROUTER_UPDATE_ERROR)).toBeInTheDocument();
    expect(
      screen.queryByText("Database routing enabled"),
    ).not.toBeInTheDocument();
  });

  it("should send a grant change made before the stored attribute has arrived", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await pickUserAttribute("cool_guy");

    // the prop still lags the store, which is exactly when the admin is looking at this switch
    await userEvent.click(screen.getByLabelText("Allow anonymous access"));
    // the grant is in force on the server, so withdrawing it is confirmed like any other revoke
    await userEvent.click(
      within(
        await screen.findByRole("dialog", {
          name: "Stop serving anonymous visitors?",
        }),
      ).getByRole("button", { name: "Stop serving them" }),
    );

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
    expect(screen.getByLabelText("Allow anonymous access")).not.toBeChecked();
  });

  it("should keep showing a grant it just saved while the prop still lags", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Stop serving them");
    await pickUserAttribute("cool_guy");

    const grant = screen.getByLabelText("Allow anonymous access");
    await userEvent.click(grant);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: true,
    });
    // snapping back to the lagging prop would contradict what the server just accepted
    expect(grant).toBeChecked();
  });
});

describe("DatabaseRoutingSection confirmation before revoking anonymous access", () => {
  const CONFIRMATION = "Stop serving anonymous visitors?";

  const findConfirmation = () =>
    screen.findByRole("dialog", { name: CONFIRMATION });
  const queryConfirmation = () =>
    screen.queryByRole("dialog", { name: CONFIRMATION });

  const grantedDatabase = (overrides: Partial<Database> = {}) =>
    routedDatabase({ router_anonymous_access_granted: true, ...overrides });

  const revokeAnonymousAccess = async () =>
    userEvent.click(await screen.findByLabelText("Allow anonymous access"));

  const confirmRevoke = async () =>
    userEvent.click(
      within(await findConfirmation()).getByRole("button", {
        name: "Stop serving them",
      }),
    );

  it("should ask before sending anything when the grant is turned off on a reachable database", async () => {
    setup({ database: grantedDatabase(), anonymouslyReachable: true });
    await waitForReachabilityFact();

    await revokeAnonymousAccess();

    expect(await findConfirmation()).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should leave the switch on and send nothing when the confirmation is declined", async () => {
    setup({ database: grantedDatabase(), anonymouslyReachable: true });
    await waitForReachabilityFact();

    await revokeAnonymousAccess();
    await userEvent.click(
      within(await findConfirmation()).getByRole("button", { name: "Cancel" }),
    );

    expect(queryConfirmation()).not.toBeInTheDocument();
    expect(screen.getByLabelText("Allow anonymous access")).toBeChecked();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should revoke the grant and confirm it with a toast once the admin confirms", async () => {
    setup({ database: grantedDatabase(), anonymouslyReachable: true });
    await waitForReachabilityFact();

    await revokeAnonymousAccess();
    await confirmRevoke();

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
    expect(
      await screen.findByText("Anonymous access disallowed"),
    ).toBeInTheDocument();
  });

  it("should not ask about a database nothing anonymous reaches", async () => {
    setup({ database: grantedDatabase(), anonymouslyReachable: false });
    await waitForReachabilityFact();

    await revokeAnonymousAccess();

    expect(queryConfirmation()).not.toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
  });

  it("should never ask when the grant is turned on, since that only widens what works", async () => {
    setup({
      database: routedDatabase({ router_anonymous_access_granted: false }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await userEvent.click(
      await screen.findByLabelText("Allow anonymous access"),
    );

    expect(queryConfirmation()).not.toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: true,
    });
  });

  it("should say what stops working without over-claiming which surface reaches the database", async () => {
    setup({ database: grantedDatabase(), anonymouslyReachable: true });
    await waitForReachabilityFact();

    await revokeAnonymousAccess();

    const confirmation = await findConfirmation();
    // the reachability fact is true of either surface, so the copy may only disjoin them
    expect(confirmation).toHaveTextContent(
      "through a public link or a published guest embed",
    );
    expect(confirmation).toHaveTextContent("stop returning data");
    // its one row leaves nothing unlisted, so there is no count to show beside the list
    expect(confirmation).not.toHaveTextContent(/\d/);
  });

  it("should leave a just-stored router untouched when the confirmation is declined", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    await pickUserAttribute("cool_guy");
    await revokeAnonymousAccess();
    await userEvent.click(
      within(await findConfirmation()).getByRole("button", { name: "Cancel" }),
    );

    // the prop still lags the store, so declining must not drop what the panel remembers of it
    expect(screen.getByLabelText("Enable database routing")).toBeChecked();
    const grant = screen.getByLabelText("Allow anonymous access");
    expect(grant).toBeChecked();
    expect(grant).toBeEnabled();
    expect(await findRequests("PUT")).toHaveLength(1);
  });

  it("should let the grant be given while the reachability fact is still in flight", async () => {
    const { releaseReach } = setup({
      database: routedDatabase({ router_anonymous_access_granted: false }),
      anonymouslyReachable: true,
      holdReach: true,
    });

    // granting only widens what works, so it is never held for a fact it does not need
    const grant = await screen.findByLabelText("Allow anonymous access");
    expect(grant).toBeEnabled();
    await userEvent.click(grant);

    releaseReach();

    expect(queryConfirmation()).not.toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: true,
    });
  });

  it("should revoke unasked when the reachability fact cannot be fetched at all", async () => {
    setup({
      database: grantedDatabase(),
      anonymouslyReachable: true,
      reachStatus: 500,
    });

    const grant = await screen.findByLabelText("Allow anonymous access");
    await waitFor(() => expect(grant).toBeEnabled());

    await userEvent.click(grant);

    // no honest question can be put without the fact, so this proceeds unasked, by design
    expect(queryConfirmation()).not.toBeInTheDocument();
    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toEqual({
      user_attribute: "cool_guy",
      anonymous_access_granted: false,
    });
  });

  it("should not let the grant be revoked before the reachability fact has arrived", async () => {
    const { releaseReach } = setup({
      database: grantedDatabase(),
      anonymouslyReachable: true,
      holdReach: true,
    });

    // nothing is yet known about what the grant is serving, so it cannot be decided
    const grant = await screen.findByLabelText("Allow anonymous access");
    expect(grant).toBeDisabled();
    await userEvent.click(grant);
    expect(queryConfirmation()).not.toBeInTheDocument();

    releaseReach();
    await waitFor(() => expect(grant).toBeEnabled());

    await userEvent.click(grant);
    expect(await findConfirmation()).toBeInTheDocument();
    expect(await findRequests("PUT")).toHaveLength(0);
  });

  it("should not ask again about an answer the admin is still free to revise", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    await enableRoutingAndAnswer("Keep serving them");
    // nothing is stored yet, so there is no grant in force to take anything away
    await userEvent.click(screen.getByLabelText("Allow anonymous access"));

    expect(queryConfirmation()).not.toBeInTheDocument();
    expect(screen.getByLabelText("Allow anonymous access")).not.toBeChecked();
    expect(await findRequests("PUT")).toHaveLength(0);
  });
});

describe("DatabaseRoutingSection anonymous reach list", () => {
  const KEEPS_WORKING = "These keep working while anonymous access is allowed:";
  const HAS_STOPPED = "These have stopped returning data:";
  const AT_STAKE = "Anonymous visitors reach this database through:";
  const WILL_STOP = "These will stop returning data:";
  const SETTINGS_LINK = "See public sharing settings";

  const findList = () => screen.findByTestId("anonymous-reach-list");
  const queryList = () => screen.queryByTestId("anonymous-reach-list");
  const rowsOf = (list: HTMLElement) => within(list).getAllByRole("listitem");

  const grantedDatabase = (overrides: Partial<Database> = {}) =>
    routedDatabase({ router_anonymous_access_granted: true, ...overrides });

  const openRevokeConfirmation = async () => {
    await userEvent.click(
      await screen.findByLabelText("Allow anonymous access"),
    );
    return screen.findByRole("dialog", {
      name: "Stop serving anonymous visitors?",
    });
  };

  describe("in the question raised at the toggle", () => {
    const setupUnansweredRouter = (reach: DatabaseAnonymousReach) =>
      setup({
        database: routingCapableDatabase({ router_user_attribute: null }),
        reach,
      });

    it("should name what the decision is about, before anything is sent", async () => {
      setupUnansweredRouter(
        reachServing([
          reachingEntity({ id: 11, name: "Quarterly revenue" }),
          reachingEntity({ id: 12, model: "card", name: "Signups by week" }),
        ]),
      );
      await waitForReachabilityFact();

      await userEvent.click(screen.getByLabelText("Enable database routing"));

      const question = await findQuestion();
      expect(question).toHaveTextContent(AT_STAKE);
      expect(
        within(question).getByRole("link", { name: "Quarterly revenue" }),
      ).toHaveAttribute("href", "/dashboard/11-quarterly-revenue");
      expect(
        within(question).getByRole("link", { name: "Signups by week" }),
      ).toHaveAttribute("href", "/question/12-signups-by-week");
      expect(await findRequests("PUT")).toHaveLength(0);
    });

    it("should show at most five rows and count the rest", async () => {
      setupUnansweredRouter(reachServing(reachingEntities(8)));
      await waitForReachabilityFact();

      await userEvent.click(screen.getByLabelText("Enable database routing"));

      const list = within(await findQuestion()).getByTestId(
        "anonymous-reach-list",
      );
      expect(rowsOf(list)).toHaveLength(5);
      expect(list).toHaveTextContent("3 more are not listed here.");
    });

    it("should count against the exact total even when the server cap hid the rest", async () => {
      setupUnansweredRouter(reachServing(reachingEntities(100), 412));
      await waitForReachabilityFact();

      await userEvent.click(screen.getByLabelText("Enable database routing"));

      const list = within(await findQuestion()).getByTestId(
        "anonymous-reach-list",
      );
      expect(rowsOf(list)).toHaveLength(5);
      expect(list).toHaveTextContent("407 more are not listed here.");
    });

    it("should not send the admin out of a decision it has not taken yet", async () => {
      setupUnansweredRouter(reachServing(reachingEntities(100), 412));
      await waitForReachabilityFact();

      await userEvent.click(screen.getByLabelText("Enable database routing"));

      expect(
        within(await findQuestion()).queryByRole("link", {
          name: SETTINGS_LINK,
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("in the revoke confirmation", () => {
    it("should carry the same five-row list", async () => {
      setup({
        database: grantedDatabase(),
        reach: reachServing(reachingEntities(7)),
      });
      await waitForReachabilityFact();

      const confirmation = await openRevokeConfirmation();

      expect(confirmation).toHaveTextContent(WILL_STOP);
      const list = within(confirmation).getByTestId("anonymous-reach-list");
      expect(rowsOf(list)).toHaveLength(5);
      expect(list).toHaveTextContent("2 more are not listed here.");
    });

    it("should still revoke the grant with the list in front of the admin", async () => {
      setup({
        database: grantedDatabase(),
        reach: reachServing([reachingEntity()]),
      });
      await waitForReachabilityFact();

      const confirmation = await openRevokeConfirmation();
      await userEvent.click(
        within(confirmation).getByRole("button", { name: "Stop serving them" }),
      );

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toEqual({
        user_attribute: "cool_guy",
        anonymous_access_granted: false,
      });
    });
  });

  describe("in the panel", () => {
    it("should carry the list in the stopped-serving warning", async () => {
      setup({
        database: routedDatabase({ router_anonymous_access_granted: false }),
        reach: reachServing([reachingEntity()]),
      });

      const warning = await screen.findByRole("alert", {
        name: "This database has stopped serving anonymous visitors",
      });

      const list = within(warning).getByTestId("anonymous-reach-list");
      expect(list).toHaveTextContent(HAS_STOPPED);
      expect(
        within(list).getByRole("link", { name: "Quarterly revenue" }),
      ).toBeInTheDocument();
    });

    it("should say what the grant keeps working while it stands", async () => {
      setup({
        database: grantedDatabase(),
        reach: reachServing([reachingEntity()]),
      });

      const list = await findList();
      expect(list).toHaveTextContent(KEEPS_WORKING);
      expect(list).not.toHaveTextContent(HAS_STOPPED);
      // the caption says what the rows are, so it is the list's name
      expect(within(list).getByRole("list")).toHaveAccessibleName(
        KEEPS_WORKING,
      );
      expect(
        screen.queryByRole("alert", {
          name: "This database has stopped serving anonymous visitors",
        }),
      ).not.toBeInTheDocument();
    });

    it("should show nothing while routing is off", async () => {
      setup({
        database: routingCapableDatabase({ router_user_attribute: null }),
        reach: reachServing([reachingEntity()]),
      });
      await waitForReachabilityFact();

      // the chevron only discloses the panel; it turns nothing on
      await userEvent.click(screen.getByLabelText("chevrondown icon"));

      expect(queryList()).not.toBeInTheDocument();
    });

    it("should show the list while routing is only being turned on", async () => {
      setup({
        database: routingCapableDatabase({ router_user_attribute: null }),
        reach: reachServing([reachingEntity()]),
      });
      await waitForReachabilityFact();

      await enableRoutingAndAnswer("Keep serving them");

      const list = await findList();
      expect(list).toHaveTextContent(KEEPS_WORKING);
    });

    it("should name what a chosen but unstored refusal will stop", async () => {
      setup({
        database: routingCapableDatabase({ router_user_attribute: null }),
        reach: reachServing([reachingEntity()]),
      });
      await waitForReachabilityFact();

      await enableRoutingAndAnswer("Stop serving them");

      const list = await findList();
      // nothing has reached the server yet, so nothing has stopped
      expect(list).toHaveTextContent(WILL_STOP);
      expect(list).not.toHaveTextContent(HAS_STOPPED);
    });

    it("should leave the open question to carry the list on its own", async () => {
      setup({
        database: routingCapableDatabase({ router_user_attribute: null }),
        reach: reachServing([reachingEntity()]),
      });
      await waitForReachabilityFact();

      await userEvent.click(screen.getByLabelText("Enable database routing"));

      const question = await findQuestion();
      expect(
        within(question).getByTestId("anonymous-reach-list"),
      ).toBeInTheDocument();
      expect(screen.getAllByTestId("anonymous-reach-list")).toHaveLength(1);
    });

    it("should list everything the server served, in a bounded scrolling region", async () => {
      setup({
        database: grantedDatabase(),
        reach: reachServing(reachingEntities(100)),
      });

      const list = await findList();
      expect(rowsOf(list)).toHaveLength(100);
      expect(within(list).getByTestId("anonymous-reach-scroll")).toHaveStyle({
        maxHeight: "13.75rem",
      });
    });

    it("should say how many the cap left out and point at the public-sharing settings", async () => {
      setup({
        database: grantedDatabase(),
        reach: reachServing(reachingEntities(3), 43),
      });

      const list = await findList();
      expect(list).toHaveTextContent("40 more are not listed here.");
      expect(
        within(list).getByRole("link", { name: SETTINGS_LINK }),
      ).toHaveAttribute("href", "/admin/settings/public-sharing");
    });

    it("should say nothing about unlisted rows when it is showing them all", async () => {
      setup({
        database: grantedDatabase(),
        reach: reachServing(reachingEntities(3)),
      });

      const list = await findList();
      expect(list).not.toHaveTextContent("not listed here");
      expect(
        within(list).queryByRole("link", { name: SETTINGS_LINK }),
      ).not.toBeInTheDocument();
    });

    it("should render nothing when nothing anonymous reaches the database", async () => {
      setup({ database: grantedDatabase(), anonymouslyReachable: false });
      await waitForReachabilityFact();

      expect(queryList()).not.toBeInTheDocument();
    });
  });

  describe("a row", () => {
    const setupRows = (data: AnonymouslyReachingEntity[]) =>
      setup({ database: grantedDatabase(), reach: reachServing(data) });

    it("should name the entity and link through to it", async () => {
      setupRows([
        reachingEntity({
          id: 11,
          model: "dashboard",
          name: "Quarterly revenue",
        }),
        reachingEntity({ id: 12, model: "card", name: "Signups by week" }),
        reachingEntity({ id: 13, model: "document", name: "Launch notes" }),
        reachingEntity({ id: 14, model: "dataset", name: "Clean orders" }),
        reachingEntity({ id: 15, model: "metric", name: "Revenue" }),
      ]);

      const list = await findList();
      const hrefOf = (name: string) =>
        within(list).getByRole("link", { name }).getAttribute("href");
      expect(hrefOf("Quarterly revenue")).toBe(
        "/dashboard/11-quarterly-revenue",
      );
      expect(hrefOf("Signups by week")).toBe("/question/12-signups-by-week");
      expect(hrefOf("Launch notes")).toBe("/document/13");
      expect(hrefOf("Clean orders")).toBe("/model/14-clean-orders");
      expect(hrefOf("Revenue")).toBe("/metric/15");
    });

    it("should say which anonymous surfaces reach the database through it", async () => {
      setupRows([
        reachingEntity({
          id: 11,
          name: "Only public",
          surfaces: ["public-link"],
        }),
        reachingEntity({
          id: 12,
          name: "Only embedded",
          surfaces: ["guest-embed"],
        }),
        reachingEntity({
          id: 13,
          name: "Both ways",
          surfaces: ["guest-embed", "public-link"],
        }),
      ]);

      // rows come back in the order the endpoint served them
      const [publicOnly, embedOnly, bothWays] = rowsOf(await findList());
      expect(publicOnly).toHaveTextContent("Only public");
      expect(publicOnly).toHaveTextContent("Public link");
      expect(embedOnly).toHaveTextContent("Only embedded");
      expect(embedOnly).toHaveTextContent("Guest embed");
      expect(bothWays).toHaveTextContent("Both ways");
      expect(bothWays).toHaveTextContent("Public link and guest embed");
    });

    it("should say when its only path to the database is a filter's value list", async () => {
      setupRows([
        reachingEntity({
          id: 11,
          name: "Filtered elsewhere",
          reaches_indirectly: true,
        }),
        reachingEntity({ id: 12, name: "Built on this database" }),
      ]);

      const indirectLine =
        "Reaches this database through a filter's value list";
      const [indirect, direct] = rowsOf(await findList());
      expect(indirect).toHaveTextContent("Filtered elsewhere");
      expect(indirect).toHaveTextContent(indirectLine);
      expect(direct).toHaveTextContent("Built on this database");
      expect(direct).not.toHaveTextContent(indirectLine);
    });

    it("should offer no action, destructive or otherwise", async () => {
      setupRows(reachingEntities(3));

      const list = await findList();
      expect(within(list).queryAllByRole("button")).toHaveLength(0);
      expect(
        within(list).queryByText(/revoke|unpublish|disable/i),
      ).not.toBeInTheDocument();
    });
  });

  it("should render nothing at all for a non-admin", async () => {
    setup({
      database: grantedDatabase(),
      isAdmin: false,
      reach: reachServing([reachingEntity()]),
    });

    expect(
      await screen.findByLabelText("Allow anonymous access"),
    ).toBeDisabled();
    expect(queryList()).not.toBeInTheDocument();
    // the fact is admin-only, so it is never even asked for
    const gets = await findRequests("GET");
    expect(gets.some(({ url }) => url.includes("anonymous-reach"))).toBe(false);
  });
});
