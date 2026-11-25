import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardQuestionCandidatesEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupRootCollectionItemsEndpoint,
  setupTenantCollectionItemsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  getIcon,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { CollectionHeader } from "metabase/collections/components/CollectionHeader";
import { Route } from "metabase/router";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { NewModals } from "./NewModals";

// The header's "Create a new collection" button opens the app-level NewModals,
// which starts the form in the collection of the current route.
describe("NewModals > shared tenant collections", () => {
  const rootCollection = createMockCollection({
    id: "root",
    name: "Our analytics",
    can_write: true,
  });
  const sharedCollection = createMockCollection({
    id: 10,
    name: "Test Shared Collection",
    namespace: "shared-tenant-collection",
    location: "/",
    can_write: true,
  });
  const sharedSubCollection = createMockCollection({
    id: 11,
    name: "Shared Sub Collection",
    namespace: "shared-tenant-collection",
    location: "/10/",
    can_write: true,
  });
  const regularCollection = createMockCollection({
    id: 12,
    name: "Regular Collection",
    location: "/",
    can_write: true,
  });
  const officialSharedCollection = createMockCollection({
    id: 13,
    name: "Official Shared Collection",
    namespace: "shared-tenant-collection",
    authority_level: "official",
    location: "/",
    can_write: true,
  });
  const officialRegularCollection = createMockCollection({
    id: 14,
    name: "Official Regular Collection",
    authority_level: "official",
    location: "/",
    can_write: true,
  });

  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setupSharedCollection = (collection: Collection) => {
    setupRecentViewsAndSelectionsEndpoints([], ["views", "selections"]);
    setupCollectionsEndpoints({
      collections: [
        sharedCollection,
        sharedSubCollection,
        regularCollection,
        officialSharedCollection,
        officialRegularCollection,
      ],
      rootCollection,
    });
    setupCollectionByIdEndpoint({
      collections: [
        rootCollection,
        sharedCollection,
        sharedSubCollection,
        regularCollection,
        officialSharedCollection,
        officialRegularCollection,
      ],
    });
    setupRootCollectionItemsEndpoint({
      rootCollectionItems: [
        createMockCollectionItem({
          id: 12,
          name: regularCollection.name,
          model: "collection",
          location: "/",
          can_write: true,
        }),
      ],
      tenantRootItems: [
        createMockCollectionItem({
          id: 10,
          name: sharedCollection.name,
          model: "collection",
          location: "/",
          namespace: "shared-tenant-collection",
          can_write: true,
          here: ["collection"],
        }),
      ],
    });

    setupTenantCollectionItemsEndpoint({
      collection: sharedCollection,
      collectionItems: [
        createMockCollectionItem({
          id: 11,
          name: sharedSubCollection.name,
          model: "collection",
          location: "/10/",
          namespace: "shared-tenant-collection",
          can_write: true,
        }),
      ],
    });
    setupTenantCollectionItemsEndpoint({
      collection: sharedSubCollection,
      collectionItems: [],
    });
    setupCollectionItemsEndpoint({
      collection: regularCollection,
      collectionItems: [],
    });
    setupTenantCollectionItemsEndpoint({
      collection: officialSharedCollection,
      collectionItems: [],
    });
    setupCollectionItemsEndpoint({
      collection: officialRegularCollection,
      collectionItems: [],
    });

    setupDashboardQuestionCandidatesEndpoint([]);
    setupUserKeyValueEndpoints({
      key: "collection-menu",
      namespace: "indicator-menu",
      value: [],
    });
    setupUserKeyValueEndpoints({
      key: "move-to-dashboard",
      namespace: "user_acknowledgement",
      value: true,
    });
    setupUserKeyValueEndpoints({
      key: "events-menu",
      namespace: "user_acknowledgement",
      value: false,
    });
    // `mockSettings` sets the token features that the plugins read when they
    // initialize, so it has to run first.
    const storeInitialState = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "use-tenants": true,
        "token-features": createMockTokenFeatures({
          official_collections: true,
          tenants: true,
        }),
      }),
    });
    setupEnterpriseOnlyPlugin("collections");
    setupEnterpriseOnlyPlugin("tenants");

    renderWithProviders(
      <Route
        path="/collection/:slug"
        element={
          <>
            <CollectionHeader
              collection={collection}
              isAdmin
              isBookmarked={false}
              canUpload={false}
              uploadsEnabled
              onCreateBookmark={jest.fn()}
              onDeleteBookmark={jest.fn()}
              onSaveFile={jest.fn()}
            />
            <NewModals />
          </>
        }
      />,
      {
        withRouter: true,
        initialRoute: `/collection/${collection.id}`,
        storeInitialState,
      },
    );
  };

  const openCollectionMenu = async () => {
    await userEvent.click(getIcon("ellipsis"));
    return screen.findByRole("menu");
  };

  const openNewCollectionModal = async () => {
    await userEvent.click(
      within(screen.getByTestId("collection-menu")).getByLabelText(
        "Create a new collection",
      ),
    );
    return screen.findByTestId("new-collection-modal");
  };

  // The button stays disabled until the picker has loaded the picked item.
  const clickSelect = async (picker: HTMLElement) => {
    const button = within(picker).getByRole("button", { name: "Select" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
  };

  it.each([
    { title: "a shared collection", collection: sharedCollection },
    { title: "a shared sub-collection", collection: sharedSubCollection },
  ])("should not offer to make $title official", async ({ collection }) => {
    setupSharedCollection(collection);

    const menu = await openCollectionMenu();
    expect(within(menu).getByText("Move")).toBeVisible();
    expect(within(menu).getByText("Move to trash")).toBeVisible();
    expect(
      within(menu).queryByText("Make collection official"),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByText("Remove Official badge"),
    ).not.toBeInTheDocument();
  });

  it("should not offer to remove the Official badge from an official shared collection", async () => {
    setupSharedCollection(officialSharedCollection);

    const menu = await openCollectionMenu();
    expect(within(menu).getByText("Move")).toBeVisible();
    expect(
      within(menu).queryByText("Remove Official badge"),
    ).not.toBeInTheDocument();
    expect(
      within(menu).queryByText("Make collection official"),
    ).not.toBeInTheDocument();
  });

  it("should offer to remove the Official badge from an official regular collection with the same setup", async () => {
    setupSharedCollection(officialRegularCollection);

    const menu = await openCollectionMenu();
    expect(within(menu).getByText("Remove Official badge")).toBeVisible();
  });

  it.each([
    { title: "a shared collection", collection: sharedCollection },
    { title: "a shared sub-collection", collection: sharedSubCollection },
  ])(
    "should not show the collection type picker when creating a collection inside $title",
    async ({ collection }) => {
      setupSharedCollection(collection);

      const modal = await openNewCollectionModal();
      await waitFor(() =>
        expect(
          within(modal).getByTestId("collection-picker-button"),
        ).toHaveTextContent(collection.name),
      );
      expect(
        within(modal).queryByText(/Collection type/i),
      ).not.toBeInTheDocument();
      expect(within(modal).queryByText("Regular")).not.toBeInTheDocument();
      expect(within(modal).queryByText("Official")).not.toBeInTheDocument();
    },
  );

  it("should show the collection type picker again when the parent changes from a shared collection to Our analytics", async () => {
    setupSharedCollection(sharedCollection);

    const modal = await openNewCollectionModal();
    await waitFor(() =>
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent(sharedCollection.name),
    );
    expect(
      within(modal).queryByText(/Collection type/i),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(modal).getByTestId("collection-picker-button"),
    );
    const picker = await screen.findByTestId("entity-picker-modal");
    // The picker opens on the current parent; let it load before navigating.
    await within(picker).findByText(sharedSubCollection.name);
    await userEvent.click(await within(picker).findByText("Our analytics"));
    await clickSelect(picker);

    await waitFor(() =>
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent("Our analytics"),
    );
    expect(within(modal).getByText(/Collection type/i)).toBeInTheDocument();
    expect(within(modal).getByText("Regular")).toBeInTheDocument();
    expect(within(modal).getByText("Official")).toBeInTheDocument();

    await userEvent.click(within(modal).getByLabelText("Close"));
    await waitFor(() =>
      expect(
        screen.queryByTestId("new-collection-modal"),
      ).not.toBeInTheDocument(),
    );
  });

  it.each([
    { title: "shared collection", path: [sharedCollection] },
    {
      title: "shared sub-collection",
      path: [sharedCollection, sharedSubCollection],
    },
  ])(
    "should hide the collection type picker when the parent changes from a regular collection to a $title",
    async ({ path }) => {
      setupSharedCollection(regularCollection);

      const modal = await openNewCollectionModal();
      await waitFor(() =>
        expect(
          within(modal).getByTestId("collection-picker-button"),
        ).toHaveTextContent(regularCollection.name),
      );
      expect(within(modal).getByText(/Collection type/i)).toBeInTheDocument();

      await userEvent.click(
        within(modal).getByTestId("collection-picker-button"),
      );
      const picker = await screen.findByTestId("entity-picker-modal");
      // The picker opens on the current parent; let it load before navigating.
      await within(picker).findByText(regularCollection.name);
      await userEvent.click(
        await within(picker).findByText("Shared collections"),
      );
      for (const collection of path) {
        await userEvent.click(await within(picker).findByText(collection.name));
      }
      await clickSelect(picker);

      const target = path[path.length - 1];
      await waitFor(() =>
        expect(
          within(modal).getByTestId("collection-picker-button"),
        ).toHaveTextContent(target.name),
      );
      expect(
        within(modal).queryByText(/Collection type/i),
      ).not.toBeInTheDocument();
      expect(within(modal).queryByText("Regular")).not.toBeInTheDocument();
      expect(within(modal).queryByText("Official")).not.toBeInTheDocument();
    },
  );

  it("should create a collection directly in the Shared collections root", async () => {
    setupSharedCollection(regularCollection);
    fetchMock.post("path:/api/collection", (call) =>
      createMockCollection({
        id: 100,
        ...JSON.parse(String(call.options.body)),
      }),
    );

    const modal = await openNewCollectionModal();
    await userEvent.type(
      within(modal).getByLabelText("Name"),
      "New Collection In Tenant Root",
    );
    await userEvent.click(
      within(modal).getByTestId("collection-picker-button"),
    );
    const picker = await screen.findByTestId("entity-picker-modal");
    await within(picker).findByText(regularCollection.name);
    await userEvent.click(
      await within(picker).findByText("Shared collections"),
    );
    await within(picker).findByText(sharedCollection.name);
    await clickSelect(picker);

    await waitFor(() =>
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent("Shared collections"),
    );
    await userEvent.click(
      within(modal).getByRole("button", { name: "Create" }),
    );

    const findCollectionPosts = async () =>
      (await findRequests("POST")).filter(
        ({ url }) => new URL(url).pathname === "/api/collection",
      );
    await waitFor(async () =>
      expect(await findCollectionPosts()).toHaveLength(1),
    );
    const [post] = await findCollectionPosts();
    expect(post.body).toMatchObject({
      name: "New Collection In Tenant Root",
      namespace: "shared-tenant-collection",
      parent_id: null,
    });
  });

  it("should offer the official controls for a regular collection with the same setup", async () => {
    setupSharedCollection(regularCollection);

    const menu = await openCollectionMenu();
    expect(
      within(menu).getByText("Make collection official"),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    const modal = await openNewCollectionModal();
    await waitFor(() =>
      expect(
        within(modal).getByTestId("collection-picker-button"),
      ).toHaveTextContent(regularCollection.name),
    );
    expect(within(modal).getByText(/Collection type/i)).toBeInTheDocument();
    expect(within(modal).getByText("Regular")).toBeInTheDocument();
    expect(within(modal).getByText("Official")).toBeInTheDocument();
  });
});
