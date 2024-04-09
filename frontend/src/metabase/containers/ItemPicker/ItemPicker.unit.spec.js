import userEvent from "@testing-library/user-event";

import {
  setupCollectionsEndpoints,
  setupDashboardCollectionItemsEndpoint,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { isPersonalCollectionOrChild } from "metabase/collections/utils";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";
import {
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import ItemPicker from "./ItemPicker";
import {
  getItemPickerHeader,
  getItemPickerList,
  openCollectionWait,
} from "./test-utils";

const CURRENT_USER = createMockUser({
  id: 1,
  personal_collection_id: 100,
  is_superuser: true,
});

const COLLECTION = {
  ROOT: createMockCollection({
    ...ROOT_COLLECTION,
    can_write: true,
  }),
  PERSONAL: createMockCollection({
    id: CURRENT_USER.personal_collection_id,
    name: "My personal collection",
    personal_owner_id: CURRENT_USER.id,
    can_write: true,
  }),
  REGULAR: createMockCollection({
    id: 1,
    name: "Regular collection",
    can_write: true,
  }),
  REGULAR_2: createMockCollection({
    id: 6,
    name: "Regular collection 2",
    can_write: true,
  }),
  READ_ONLY: createMockCollection({
    id: 2,
    name: "Read only collection",
    can_write: false,
  }),
};

COLLECTION.REGULAR_CHILD = createMockCollection({
  id: 3,
  name: "Regular collection's child",
  location: `/${COLLECTION.REGULAR.id}/`,
  can_write: true,
});

const COLLECTION_READ_ONLY_CHILD_WRITABLE = createMockCollection({
  id: 4,
  name: "Read-only collection's child (writable)",
  location: `/${COLLECTION.READ_ONLY.id}/`,
  can_write: true,
});

const COLLECTION_OTHER_USERS = createMockCollection({
  id: 5,
  name: "John Lennon's personal collection",
  personal_owner_id: CURRENT_USER.id + 1,
  can_write: true,
});

const DASHBOARD = {
  REGULAR: createMockDashboard({
    id: 1,
    name: "Regular dashboard",
    model: "dashboard",
  }),
  REGULAR_CHILD: createMockDashboard({
    id: 2,
    name: "Regular dashboard (nested)",
    model: "dashboard",
    collection_id: COLLECTION.REGULAR.id,
  }),
  PERSONAL_CHILD: createMockDashboard({
    id: 3,
    name: "Personal dashboard",
    model: "dashboard",
    collection_id: COLLECTION.PERSONAL.id,
  }),
};

async function setup({
  models = ["dashboard"],
  collections = Object.values(COLLECTION),
  rootCollection = COLLECTION.ROOT,
  query,
  ...props
} = {}) {
  if (models.includes("dashboard")) {
    setupDashboardCollectionItemsEndpoint(Object.values(DASHBOARD));
  }

  setupCollectionsEndpoints({ collections, rootCollection });
  setupSearchEndpoints([
    DASHBOARD.REGULAR,
    DASHBOARD.REGULAR_CHILD,
    DASHBOARD.PERSONAL_CHILD,
  ]);

  const onChange = jest.fn();

  renderWithProviders(
    <ItemPicker models={models} query={query} onChange={onChange} {...props} />,
    {
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );

  await waitForLoaderToBeRemoved();

  return { onChange };
}

describe("ItemPicker", () => {
  it("displays items from the root collection by default", async () => {
    await setup();

    // Breadcrumbs
    expect(
      within(getItemPickerHeader()).getByText(/Our analytics/i),
    ).toBeInTheDocument();

    // Content
    expect(screen.getByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(screen.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(screen.getByText(COLLECTION.REGULAR_2.name)).toBeInTheDocument();
    expect(screen.getByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(screen.queryAllByTestId("item-picker-item")).toHaveLength(4);
  });

  it("does not display read-only collections", async () => {
    await setup();
    expect(
      screen.queryByText(COLLECTION.READ_ONLY.name),
    ).not.toBeInTheDocument();
  });

  it("displays read-only collections if they have writable children", async () => {
    await setup({
      collections: [
        ...Object.values(COLLECTION),
        COLLECTION_READ_ONLY_CHILD_WRITABLE,
      ],
    });
    expect(screen.getByText(COLLECTION.READ_ONLY.name)).toBeInTheDocument();
  });

  it("can open nested collection", async () => {
    await setup();

    await openCollectionWait(COLLECTION.REGULAR.name);

    const header = within(getItemPickerHeader());
    const list = within(getItemPickerList());

    // Breadcrumbs
    expect(header.getByText(/Our analytics/i)).toBeInTheDocument();
    expect(header.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();

    // Content
    expect(list.getByText(COLLECTION.REGULAR_CHILD.name)).toBeInTheDocument();
    expect(list.getByText(DASHBOARD.REGULAR_CHILD.name)).toBeInTheDocument();
    expect(list.getAllByTestId("item-picker-item")).toHaveLength(2);
  });

  it("can navigate back from a currently open nested collection", async () => {
    await setup();
    await openCollectionWait(COLLECTION.REGULAR.name);
    let header = within(getItemPickerHeader());

    await userEvent.click(header.getByText(/Our analytics/i));

    header = within(getItemPickerHeader());
    const list = within(getItemPickerList());

    expect(header.queryByText(COLLECTION.REGULAR.name)).not.toBeInTheDocument();

    expect(list.getByText(DASHBOARD.REGULAR.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.REGULAR_2.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(list.getAllByTestId("item-picker-item")).toHaveLength(4);
  });

  it("calls onChange when selecting an item", async () => {
    const { onChange } = await setup();

    await userEvent.click(screen.getByText(DASHBOARD.REGULAR.name));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining(DASHBOARD.REGULAR),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onChange if it's not a collection picker", async () => {
    const { onChange } = await setup();
    await userEvent.click(screen.getByText(COLLECTION.REGULAR.name));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("groups personal collections into single folder if there are more than one", async () => {
    await setup({
      collections: [...Object.values(COLLECTION), COLLECTION_OTHER_USERS],
    });

    await userEvent.click(screen.getByText(/All personal collections/i));

    const list = within(getItemPickerList());
    expect(list.getByText(COLLECTION_OTHER_USERS.name)).toBeInTheDocument();
    expect(list.getByText(COLLECTION.PERSONAL.name)).toBeInTheDocument();
    expect(list.getAllByTestId("item-picker-item")).toHaveLength(2);
  });

  it("preselects value in the correspondent collection", async () => {
    await setup({
      initialOpenCollectionId: DASHBOARD.REGULAR_CHILD.collection_id,
      value: {
        model: "dashboard",
        id: DASHBOARD.REGULAR_CHILD.id,
      },
    });

    const header = within(getItemPickerHeader());

    // nested collection
    expect(header.getByText(COLLECTION.ROOT.name)).toBeInTheDocument();
    expect(header.getByText(COLLECTION.REGULAR.name)).toBeInTheDocument();

    const list = within(getItemPickerList());
    expect(list.getByText(DASHBOARD.REGULAR_CHILD.name)).toBeInTheDocument();
  });

  describe("preserves order of collections coming from API endpoint", () => {
    it("[personal, regular, regular 2]", async () => {
      const collections = [
        COLLECTION.PERSONAL,
        COLLECTION.REGULAR,
        COLLECTION.REGULAR_2,
      ];

      await setup({ collections });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
      expect(items[2]).toHaveTextContent(collections[2].name);
    });

    it("[personal, regular 2, regular]", async () => {
      const collections = [
        COLLECTION.PERSONAL,
        COLLECTION.REGULAR_2,
        COLLECTION.REGULAR,
      ];

      await setup({ collections });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
      expect(items[2]).toHaveTextContent(collections[2].name);
    });

    it("always shows personal collection first", async () => {
      const collections = [
        COLLECTION.REGULAR_2,
        COLLECTION.REGULAR,
        COLLECTION.PERSONAL,
      ];

      await setup({ collections });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(COLLECTION.PERSONAL.name);
      expect(items[1]).toHaveTextContent(COLLECTION.REGULAR_2.name);
      expect(items[2]).toHaveTextContent(COLLECTION.REGULAR.name);
    });

    it("should filter collections", async () => {
      await setup({
        query: "foo",
        collectionFilter: (collection, _index, allCollections) =>
          !isPersonalCollectionOrChild(collection, allCollections),
      });

      expect(screen.queryByText(/personal/i)).not.toBeInTheDocument();
    });

    it("should show search results", async () => {
      await setup();

      await userEvent.click(screen.getByRole("img", { name: /search/ }));
      await userEvent.type(screen.getByPlaceholderText("Search"), "das{enter}");

      expect(
        await screen.findByText(/^regular dashboard$/i),
      ).toBeInTheDocument();
      expect(await screen.findByText(/nested/i)).toBeInTheDocument();
      expect(await screen.findByText(/personal/i)).toBeInTheDocument();
    });

    it("should not show items of filtered collections when searching", async () => {
      await setup({
        collectionFilter: (collection, _index, allCollections) =>
          !isPersonalCollectionOrChild(collection, allCollections),
      });

      await userEvent.click(screen.getByRole("img", { name: /search/ }));
      await userEvent.type(screen.getByPlaceholderText("Search"), "das{enter}");

      expect(
        await screen.findByText(/^regular dashboard$/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/personal/i)).not.toBeInTheDocument();
    });
  });

  describe("preserves order of snippet collections coming from API endpoint", () => {
    it("[regular, regular 2]", async () => {
      const collections = [COLLECTION.REGULAR, COLLECTION.REGULAR_2];

      await setup({
        collections,
        entity: SnippetCollections,
        query: { namespace: "snippets" },
      });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
    });

    it("[regular 2, regular]", async () => {
      const collections = [COLLECTION.REGULAR_2, COLLECTION.REGULAR];

      await setup({
        collections,
        entity: SnippetCollections,
        query: { namespace: "snippets" },
      });

      const items = screen.getAllByTestId("item-picker-item");

      expect(items.length).toBe(collections.length);
      expect(items[0]).toHaveTextContent(collections[0].name);
      expect(items[1]).toHaveTextContent(collections[1].name);
    });
  });
});
