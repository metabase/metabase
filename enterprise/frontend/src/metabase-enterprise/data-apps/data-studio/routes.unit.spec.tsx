import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupActionEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCollectionItemsEndpoint,
  setupDataAppEndpoint,
  setupDataAppGroupsEndpoint,
  setupDataAppRepoStatusEndpoint,
  setupDatabaseListEndpoint,
  setupListDataAppsEndpoint,
  setupTableQueryMetadataEndpoint,
  setupUserAcknowledgementEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Outlet, Route } from "metabase/router";
import type { DataApp } from "metabase-types/api";
import {
  createMockCard,
  createMockCollectionItem,
  createMockDataApp,
  createMockDatabase,
  createMockDataset,
  createMockField,
  createMockImplicitQueryAction,
  createMockTable,
} from "metabase-types/api/mocks";

import { getDataStudioDataAppRoutes } from "./routes";

const SALES_APP = createMockDataApp({ id: 1, slug: "sales", name: "Sales" });

const TEAMS_APP = createMockDataApp({
  id: 2,
  slug: "teams",
  name: "Teams",
  enabled: true,
  resource_collection_id: 42,
});

const DATABASE = createMockDatabase({
  id: 1,
  name: "Writable",
  settings: { "database-enable-actions": true },
});

const TEAMS_TABLE = createMockTable({
  id: 10,
  db_id: DATABASE.id,
  db: DATABASE,
  display_name: "Scoreboard actions",
  fields: [
    createMockField({
      id: 100,
      table_id: 10,
      name: "ID",
      semantic_type: "type/PK",
    }),
  ],
});

const TEAM_LIST_CARD = createMockCard({ id: 12, name: "teamList" });

const ADD_TEAM_ACTION = createMockImplicitQueryAction({
  id: 22,
  name: "addTeam",
  model_id: null,
  table_id: TEAMS_TABLE.id,
  kind: "row/create",
});

function IsAdmin() {
  return <Outlet />;
}

type SetupOpts = {
  initialRoute: string;
};

function setup({ initialRoute }: SetupOpts) {
  setupDataAppGroupsEndpoint(TEAMS_APP.slug, []);
  setupDataAppRepoStatusEndpoint({ configured: false, url: null });

  return renderWithProviders(
    <Route path="/data-studio">{getDataStudioDataAppRoutes(IsAdmin)}</Route>,
    { withRouter: true, initialRoute },
  );
}

const getAboutSidebar = () => screen.getByTestId("data-app-about-sidebar");

describe("data app routes in Data Studio", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("opens an app from the list", async () => {
    setupListDataAppsEndpoint([SALES_APP, TEAMS_APP]);
    setupUserAcknowledgementEndpoints({
      key: "data-apps-build-guide",
      value: true,
    });
    setupDataAppEndpoint(TEAMS_APP);
    const { router } = setup({ initialRoute: "/data-studio/apps" });

    await userEvent.click(await screen.findByText("Teams"));

    await waitFor(() =>
      expect(router?.location.pathname).toBe("/data-studio/apps/teams"),
    );
    expect(
      await screen.findByTestId("data-app-about-sidebar"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("data-app-header")).toHaveTextContent("Teams");
  });

  it("opens an app's question from the Questions tab", async () => {
    setupDataAppEndpoint(TEAMS_APP);
    setupCollectionItemsEndpoint({
      collection: { id: TEAMS_APP.resource_collection_id },
      collectionItems: [
        createMockCollectionItem({ id: 11, model: "card", name: "scoreList" }),
        createMockCollectionItem({ id: 12, model: "card", name: "teamList" }),
        createMockCollectionItem({
          id: ADD_TEAM_ACTION.id,
          model: "action",
          name: "addTeam",
        }),
      ],
    });
    setupCardEndpoints(TEAM_LIST_CARD);
    setupCardQueryEndpoints(TEAM_LIST_CARD, createMockDataset());
    const { router } = setup({ initialRoute: "/data-studio/apps/teams" });

    await userEvent.click(
      await screen.findByRole("tab", { name: "Questions" }),
    );
    expect(router?.location.pathname).toBe("/data-studio/apps/teams/questions");
    expect(await screen.findByText("scoreList")).toBeInTheDocument();
    expect(screen.queryByText("addTeam")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("teamList"));

    await waitFor(() =>
      expect(router?.location.pathname).toBe(
        "/data-studio/apps/teams/questions/12",
      ),
    );
    expect(
      await screen.findByTestId("data-app-question-overview"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("data-studio-breadcrumbs")).toHaveTextContent(
      "teamList",
    );
  });

  it("opens an app's action from the Actions tab", async () => {
    setupDataAppEndpoint(TEAMS_APP);
    setupCollectionItemsEndpoint({
      collection: { id: TEAMS_APP.resource_collection_id },
      collectionItems: [
        createMockCollectionItem({ id: 12, model: "card", name: "teamList" }),
        createMockCollectionItem({
          id: 21,
          model: "action",
          name: "removeTeam",
        }),
        createMockCollectionItem({
          id: ADD_TEAM_ACTION.id,
          model: "action",
          name: "addTeam",
        }),
      ],
    });
    setupActionEndpoints(ADD_TEAM_ACTION);
    setupTableQueryMetadataEndpoint(TEAMS_TABLE);
    setupDatabaseListEndpoint([DATABASE]);
    const { router } = setup({ initialRoute: "/data-studio/apps/teams" });

    await userEvent.click(await screen.findByRole("tab", { name: "Actions" }));
    expect(await screen.findByText("removeTeam")).toBeInTheDocument();
    expect(screen.queryByText("teamList")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("addTeam"));

    expect(router?.location.pathname).toBe(
      "/data-studio/apps/teams/actions/22",
    );
    const definition = await screen.findByTestId("data-app-action-definition");
    expect(
      within(definition).getByTestId("data-app-action-header"),
    ).toHaveTextContent("addTeam");
  });

  it("shows the new status after making the app a draft and live again", async () => {
    let storedApp: DataApp = TEAMS_APP;
    fetchMock.get(`path:/api/ee/apps/${TEAMS_APP.slug}`, () => storedApp);
    fetchMock.put(`path:/api/ee/apps/${TEAMS_APP.slug}`, (call) => {
      const body: unknown = JSON.parse(String(call.options.body));
      if (
        typeof body === "object" &&
        body != null &&
        "enabled" in body &&
        typeof body.enabled === "boolean"
      ) {
        storedApp = { ...storedApp, enabled: body.enabled };
        return storedApp;
      }
      return { status: 400 };
    });
    setup({ initialRoute: "/data-studio/apps/teams" });

    expect(
      await within(
        await screen.findByTestId("data-app-about-sidebar"),
      ).findByText("Live"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Data app options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Make draft/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Make draft",
      }),
    );

    expect(
      await within(getAboutSidebar()).findByText("Draft"),
    ).toBeInTheDocument();
    expect(
      within(getAboutSidebar()).queryByText("Live"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Data app options" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Make live/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Make live",
      }),
    );

    expect(
      await within(getAboutSidebar()).findByText("Live"),
    ).toBeInTheDocument();
    expect(
      within(getAboutSidebar()).queryByText("Draft"),
    ).not.toBeInTheDocument();
  });
});
