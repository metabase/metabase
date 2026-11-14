import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { NewItemMenu } from "metabase/nav/components/NewItemMenu";
import { Outlet, Route } from "metabase/router";
import type {
  Collection,
  Database,
  UserMetabotPermissions,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItemFromCollection,
  createMockDashboard,
  createMockUser,
  createMockUserMetabotPermissions,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NewModals } from "./NewModals";

console.warn = jest.fn();
console.error = jest.fn();

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
  canWrite?: boolean;
  isConfigured?: boolean;
  metabotPermissions?: Partial<UserMetabotPermissions>;
};

const SAMPLE_DATABASE = createSampleDatabase();
const COLLECTION = createMockCollection();

async function setup({
  databases = [SAMPLE_DATABASE],
  canWrite = true,
  isConfigured = true,
  metabotPermissions,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "llm-metabot-configured?": isConfigured,
    "metabot-enabled?": true,
  });

  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions(metabotPermissions),
  );
  setupDatabasesEndpoints(databases);
  setupCollectionByIdEndpoint({
    collections: [COLLECTION],
  });
  setupEnterprisePlugins();

  const { store } = renderWithProviders(
    <Route
      path="/"
      element={
        <>
          <NewItemMenu trigger={<button>New</button>} />
          <NewModals />
        </>
      }
    />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({
          permissions: createMockUserPermissions({
            can_create_queries: true,
            can_create_native_queries: true,
          }),
          can_write_any_collection: canWrite,
        }),
      }),
    },
  );
  await userEvent.click(await screen.findByText("New"));

  return { store };
}

describe("NewItemMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should properly render menu items", async () => {
    await setup();
    expect(await screen.findByText("Question")).toBeInTheDocument();
    expect(await screen.findByText("SQL query")).toBeInTheDocument();
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Metric")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("shows AI exploration when NLQ access exists but AI is not configured", async () => {
    await setup({ isConfigured: false });

    expect(await screen.findByText("AI exploration")).toBeInTheDocument();
  });

  it("does not show AI exploration without NLQ access", async () => {
    await setup({ metabotPermissions: { "metabot-nlq": "no" } });
    await act(() => fetchMock.callHistory.flush(true));

    expect(await screen.findByText("Question")).toBeInTheDocument();
    expect(screen.queryByText("AI exploration")).not.toBeInTheDocument();
  });

  it("should support keyboard navigation", async () => {
    await setup();

    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /AI exploration/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /Question/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /Dashboard/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: /New dashboard/ }),
    ).toBeInTheDocument();
  });

  describe("navbar collapsing", () => {
    it.each(["Question", "SQL query", "Document"])(
      "should collapse the navbar when creating a new %s",
      async (itemName) => {
        const { store } = await setup();
        expect(store.getState().app.isNavbarOpen).toBe(true);

        await userEvent.click(await screen.findByText(itemName));

        expect(store.getState().app.isNavbarOpen).toBe(false);
      },
    );

    it("should not collapse the navbar when the new dashboard modal is opened and cancelled", async () => {
      const { store } = await setup();
      await userEvent.click(await screen.findByText("Dashboard"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Cancel" }),
      );

      expect(store.getState().app.isNavbarOpen).toBe(true);
    });

    it("should collapse the navbar once a new dashboard is created", async () => {
      setupCollectionsEndpoints({ collections: [COLLECTION] });
      fetchMock.post("path:/api/dashboard", createMockDashboard({ id: 42 }));
      const { store } = await setup();

      await userEvent.click(await screen.findByText("Dashboard"));
      expect(store.getState().app.isNavbarOpen).toBe(true);

      await userEvent.type(await screen.findByLabelText("Name"), "Sales");
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() =>
        expect(store.getState().app.isNavbarOpen).toBe(false),
      );
    });
  });

  describe("New Dashboard", () => {
    it("should open new dashboard modal on click", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Dashboard"));
      const modal = await screen.findByRole("dialog");
      expect(modal).toHaveTextContent("New dashboard");
    });

    it("should not be available if the user has no write permissions to collection", async () => {
      await setup({ canWrite: false });
      expect(await screen.findByText("Question")).toBeInTheDocument();
      expect(await screen.findByText("SQL query")).toBeInTheDocument();
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    });
  });
});

describe("NewItemMenu > new dashboard default collection", () => {
  const USER_ID = 7;
  const PERSONAL_COLLECTION = createMockCollection({
    id: 20,
    name: "Read Only Tableton's Personal Collection",
    personal_owner_id: USER_ID,
    is_personal: true,
    can_write: true,
  });
  const FIRST_COLLECTION = createMockCollection({
    id: 10,
    name: "First collection",
    location: "/",
  });
  const SECOND_COLLECTION = createMockCollection({
    id: 11,
    name: "Second collection",
    location: "/10/",
  });
  const THIRD_COLLECTION = createMockCollection({
    id: 12,
    name: "Third collection",
    location: "/10/11/",
  });
  // Shares its id with the dashboard below, so reading the dashboard id as a
  // collection id would offer this collection.
  const DECOY_COLLECTION = createMockCollection({
    id: 5,
    name: "Decoy collection",
    location: "/",
    can_write: true,
  });

  type SetupOpts = {
    route: string;
    canCurate: boolean;
  };

  const setupNewDashboard = async ({ route, canCurate }: SetupOpts) => {
    mockGetBoundingClientRect();
    const rootCollection = createMockCollection({
      ...ROOT_COLLECTION,
      can_write: canCurate,
    });
    const collections: Collection[] = [
      rootCollection,
      PERSONAL_COLLECTION,
      DECOY_COLLECTION,
      ...[FIRST_COLLECTION, SECOND_COLLECTION, THIRD_COLLECTION].map(
        (collection) => ({ ...collection, can_write: canCurate }),
      ),
    ];

    setupUserMetabotPermissionsEndpoint(createMockUserMetabotPermissions());
    setupDatabasesEndpoints([SAMPLE_DATABASE]);
    setupRecentViewsAndSelectionsEndpoints([]);
    setupLibraryEndpoints();
    setupCollectionByIdEndpoint({ collections });
    setupCollectionsEndpoints({
      collections: collections.filter(({ id }) => id !== "root"),
      rootCollection,
    });
    setupCollectionItemsEndpoint({
      collection: rootCollection,
      collectionItems: [
        createMockCollectionItemFromCollection({
          ...FIRST_COLLECTION,
          can_write: canCurate,
        }),
      ],
    });
    setupCollectionItemsEndpoint({
      collection: PERSONAL_COLLECTION,
      collectionItems: [],
    });
    setupSearchEndpoints(
      collections
        .filter(({ id }) => id !== "root")
        .map((collection) =>
          createMockCollectionItemFromCollection(collection),
        ),
    );

    renderWithProviders(
      <Route
        path="/"
        element={
          <>
            <NewItemMenu trigger={<button>New</button>} />
            <NewModals />
            <Outlet />
          </>
        }
      >
        <Route path="collection/:slug" element={<div />} />
        <Route path="dashboard/:slug" element={<div />} />
      </Route>,
      {
        withRouter: true,
        initialRoute: route,
        storeInitialState: createMockState({
          currentUser: createMockUser({
            id: USER_ID,
            is_superuser: canCurate,
            personal_collection_id: PERSONAL_COLLECTION.id,
            can_write_any_collection: true,
          }),
        }),
      },
    );

    await userEvent.click(await screen.findByText("New"));
    await userEvent.click(await screen.findByText("Dashboard"));
    return screen.findByRole("dialog", { name: "New dashboard" });
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should offer the currently opened collection", async () => {
    const modal = await setupNewDashboard({
      route: "/collection/11-second-collection",
      canCurate: true,
    });

    await waitFor(() =>
      expect(
        within(modal).getByLabelText(/Which collection/),
      ).toHaveTextContent("Second collection"),
    );
  });

  it("should offer the root collection from a dashboard page (metabase#16832)", async () => {
    const modal = await setupNewDashboard({
      route: "/dashboard/5-orders-in-a-dashboard",
      canCurate: true,
    });

    await waitFor(() =>
      expect(
        within(modal).getByLabelText(/Which collection/),
      ).toHaveTextContent("Our analytics"),
    );
    expect(modal).not.toHaveTextContent("Decoy collection");
  });

  it.each(["/", "/collection/root"])(
    "should not offer collections with read access from %s (metabase#15281)",
    async (route) => {
      const modal = await setupNewDashboard({ route, canCurate: false });

      await userEvent.click(
        await within(modal).findByText(PERSONAL_COLLECTION.name),
      );

      const picker = await screen.findByRole("dialog", {
        name: "Select a collection",
      });
      expect(
        await within(picker).findByText(PERSONAL_COLLECTION.name),
      ).toBeInTheDocument();
      expect(
        within(picker).queryByText("First collection"),
      ).not.toBeInTheDocument();

      await userEvent.type(
        within(picker).getByPlaceholderText("Search…"),
        "third",
      );

      expect(
        await within(picker).findByText("We didn't find anything"),
      ).toBeInTheDocument();
      const searchCall = fetchMock.callHistory.lastCall("path:/api/search");
      const searchParams = new URL(searchCall?.url ?? "").searchParams;
      expect(searchParams.get("q")).toBe("third");
      expect(searchParams.getAll("models")).toEqual(["collection"]);
      expect(
        within(picker).queryByText("Third collection"),
      ).not.toBeInTheDocument();
    },
  );
});
