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
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

const routingCapableDatabase = (overrides: Partial<Database> = {}): Database =>
  createMockDatabase({
    engine: "postgres",
    features: ["database-routing"],
    ...overrides,
  });

const routedDatabase = (overrides: Partial<Database> = {}): Database =>
  routingCapableDatabase({ router_user_attribute: "cool_guy", ...overrides });

/** The reachability fact arrives asynchronously, and absence before it lands means nothing. */
const waitForReachabilityFact = () =>
  waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets.some(({ url }) => url.includes("usage_info"))).toBe(true);
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
  /** Hold the usage-info response until the test releases it, so a click can get in first. */
  holdUsageInfo?: boolean;
}

const setup = ({
  database = createMockDatabase(),
  isAdmin = true,
  routerUpdateStatus = 200,
  anonymouslyReachable = false,
  holdUsageInfo = false,
}: SetupOpts = {}) => {
  setupUserAttributesEndpoint(["cool_guy", "boss_gal"]);
  setupDatabasesEndpoints([database]);
  const usageInfo = createMockDatabaseUsageInfo({
    anonymously_reachable: anonymouslyReachable,
  });
  let releaseUsageInfo = () => {};
  if (holdUsageInfo) {
    const held = new Promise<void>((resolve) => {
      releaseUsageInfo = resolve;
    });
    fetchMock.get(`path:/api/database/${database.id}/usage_info`, async () => {
      await held;
      return usageInfo;
    });
  } else {
    setupDatabaseUsageInfoEndpoint(database, usageInfo);
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

  return { ...utils, releaseUsageInfo };
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
    // the warning icon, and not the info icon, separates this from the note it replaced
    expect(within(warning).getByLabelText("warning icon")).toBeInTheDocument();
    expect(
      within(warning).queryByLabelText("info icon"),
    ).not.toBeInTheDocument();
    // a count would be a stronger claim than the reachability fact supports
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

    // nothing is awaited yet, so the usage-info response cannot have been applied
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
    const { releaseUsageInfo } = setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
      holdUsageInfo: true,
    });

    await userEvent.click(screen.getByLabelText("Enable database routing"));
    expect(queryQuestion()).not.toBeInTheDocument();

    releaseUsageInfo();

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
    // the admin is not asked a second time either
    expect(queryQuestion()).not.toBeInTheDocument();
  });

  it("should ask when the attribute is reached through the chevron, not the toggle", async () => {
    setup({
      database: routingCapableDatabase({ router_user_attribute: null }),
      anonymouslyReachable: true,
    });
    await waitForReachabilityFact();

    // expanding is a disclosure, not a decision, so it must not raise the question by itself
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
