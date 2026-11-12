import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupCustomVizPluginListEndpoint,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { User } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItemFromCollection,
  createMockUser,
} from "metabase-types/api/mocks";

import { CreateDashboardModal } from "./CreateDashboardModal";

const COLLECTION = {
  ROOT: createMockCollection({
    ...ROOT_COLLECTION,
    name: "Our analytics",
    can_write: true,
  }),
  PARENT: createMockCollection({
    id: 2,
    name: "Parent collection",
    can_write: true,
  }),
  CHILD: createMockCollection({
    id: 3,
    name: "Child collection",
    can_write: true,
  }),
  PERSONAL: createMockCollection({
    id: 1,
    name: "My personal collection",
    can_write: true,
    is_personal: true,
  }),
};
COLLECTION.CHILD.location = `/${COLLECTION.PARENT.id}/`;

const OTHER_USER_COLLECTION = {
  PERSONAL: createMockCollection({
    id: 20,
    name: "Robert Tableton's Personal Collection",
    location: "/",
    is_personal: true,
    personal_owner_id: 2,
    can_write: true,
  }),
  FIRST_CHILD: createMockCollection({
    id: 21,
    name: "Normal personal collection 1",
    location: "/20/",
    is_personal: true,
    can_write: true,
  }),
  SECOND_CHILD: createMockCollection({
    id: 22,
    name: "Normal personal collection 2",
    location: "/20/",
    is_personal: true,
    can_write: true,
  }),
};

type SetupOpts = {
  mockCreateDashboardResponse?: boolean;
  currentUser?: User;
};

function setup({
  mockCreateDashboardResponse = true,
  currentUser = createMockUser(),
}: SetupOpts = {}) {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([]);
  setupLibraryEndpoints();
  setupDatabasesEndpoints([]);
  setupCustomVizPluginListEndpoint();
  const onClose = jest.fn();

  const settings = mockSettings({});

  if (mockCreateDashboardResponse) {
    fetchMock.post(`path:/api/dashboard`, (call) => call?.options.body);
  }
  const collections = [
    ...Object.values(COLLECTION),
    ...Object.values(OTHER_USER_COLLECTION),
  ];
  setupCollectionsEndpoints({
    collections,
    rootCollection: COLLECTION.ROOT,
  });

  setupCollectionItemsEndpoint({
    collection: COLLECTION.ROOT,
    collectionItems: [
      createMockCollectionItemFromCollection(COLLECTION.PARENT),
    ],
  });

  setupCollectionItemsEndpoint({
    collection: COLLECTION.PARENT,
    collectionItems: [createMockCollectionItemFromCollection(COLLECTION.CHILD)],
  });

  setupCollectionItemsEndpoint({
    collection: COLLECTION.PERSONAL,
    collectionItems: [],
  });

  setupCollectionItemsEndpoint({
    collection: OTHER_USER_COLLECTION.PERSONAL,
    collectionItems: [
      createMockCollectionItemFromCollection(OTHER_USER_COLLECTION.FIRST_CHILD),
      createMockCollectionItemFromCollection(
        OTHER_USER_COLLECTION.SECOND_CHILD,
      ),
    ],
  });
  [
    OTHER_USER_COLLECTION.FIRST_CHILD,
    OTHER_USER_COLLECTION.SECOND_CHILD,
  ].forEach((collection) =>
    setupCollectionItemsEndpoint({ collection, collectionItems: [] }),
  );

  collections
    .filter((c) => c.id !== "root")
    .forEach((c) => fetchMock.get(`path:/api/collection/${c.id}`, c));

  renderWithProviders(<CreateDashboardModal opened onClose={onClose} />, {
    storeInitialState: {
      settings,
      currentUser,
    },
  });

  return {
    onClose,
  };
}

describe("CreateDashboardModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("displays empty form fields", async () => {
    setup();

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(await screen.findByText("Our analytics")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("can't submit if name is empty", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "Create" }),
    ).toBeDisabled();
  });

  it("calls onClose when Cancel button is clicked", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("should show the path to a collection in another user's personal collection when the picker is opened again", async () => {
    setup({
      currentUser: createMockUser({
        is_superuser: true,
        personal_collection_id: Number(COLLECTION.PERSONAL.id),
      }),
    });
    const collectionPicker = () =>
      screen.getByLabelText("Which collection should this go in?");
    const expectActiveItems = async (names: string[]) => {
      for (const name of names) {
        await waitFor(() =>
          expect(
            screen.getByRole("link", { name: new RegExp(name) }),
          ).toHaveAttribute("data-active", "true"),
        );
      }
    };

    await userEvent.click(collectionPicker());
    await userEvent.click(await screen.findByText("All personal collections"));
    await userEvent.click(
      await screen.findByText(OTHER_USER_COLLECTION.PERSONAL.name),
    );
    await userEvent.click(
      await screen.findByText(OTHER_USER_COLLECTION.SECOND_CHILD.name),
    );
    await userEvent.click(screen.getByRole("button", { name: "Select" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Select a collection/ }),
      ).not.toBeInTheDocument(),
    );
    expect(collectionPicker()).toHaveTextContent(
      OTHER_USER_COLLECTION.SECOND_CHILD.name,
    );

    await userEvent.click(collectionPicker());
    await expectActiveItems([
      "All personal collections",
      OTHER_USER_COLLECTION.PERSONAL.name,
      OTHER_USER_COLLECTION.SECOND_CHILD.name,
    ]);
    expect(
      screen.getByRole("link", {
        name: new RegExp(OTHER_USER_COLLECTION.FIRST_CHILD.name),
      }),
    ).not.toHaveAttribute("data-active", "true");
  });

  it("should close the open dialogs one by one with the Escape key", async () => {
    const { onClose } = setup();
    await screen.findByRole("heading", { name: /new dashboard/i });

    await userEvent.click(screen.getByLabelText(/Which collection/));
    const newCollectionButton = await screen.findByRole("button", {
      name: /new collection/i,
    });
    await waitFor(() => expect(newCollectionButton).toBeEnabled());
    await userEvent.click(newCollectionButton);
    expect(
      await screen.findByRole("dialog", { name: "Create a new collection" }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create a new collection" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("dialog", { name: /Select a collection/ }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Select a collection/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: /new dashboard/i }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  describe("new collection modal", () => {
    const nameField = () => screen.getByRole("textbox", { name: /name/i });
    const collDropdown = () => screen.getByLabelText(/Which collection/);
    const findNewCollBtn = async () => {
      const btn = await screen.findByRole("button", {
        name: /new collection/i,
      });
      await waitFor(() => expect(btn).toBeEnabled());
      return btn;
    };
    const findDashModalTitle = () =>
      screen.findByRole("heading", { name: /new dashboard/i });

    const newCollCancelButton = () =>
      within(screen.getByRole("dialog", { name: /new collection/ })).getByRole(
        "button",
        { name: /cancel/i },
      );
    const selectCollCancelButton = () =>
      within(
        screen.getByRole("dialog", { name: /Select a collection/ }),
      ).getByRole("button", { name: /cancel/i });

    it("should have a new collection button in the collection picker", async () => {
      setup();
      await userEvent.click(collDropdown());
      expect(await findNewCollBtn()).toBeInTheDocument();
    });

    it("should open new collection modal and return to dashboard modal when clicking close", async () => {
      setup();
      const name = "my dashboard";
      await findDashModalTitle();
      await userEvent.type(nameField(), name);
      await userEvent.click(collDropdown());
      // Open New Collection Dialog
      await userEvent.click(await findNewCollBtn());
      await screen.findByText("Give it a name");
      // Close New Collection Dialog
      await userEvent.click(newCollCancelButton());
      // Close Collection Picker
      await userEvent.click(selectCollCancelButton());

      await findDashModalTitle();
      expect(nameField()).toHaveValue(name);
    });

    it("should create collection inside nested folder", async () => {
      setup();
      const name = "my dashboard";
      await userEvent.type(nameField(), name);
      //Open Collection Picker
      await userEvent.click(collDropdown());
      //Select Parent Collection
      await userEvent.click(
        await screen.findByRole("link", {
          name: new RegExp(COLLECTION.PARENT.name),
        }),
      );
      //Open Create Collection Dialog
      await userEvent.click(await findNewCollBtn());
      expect(await screen.findByText("Give it a name")).toBeInTheDocument();
    });

    it("should create collection inside root folder", async () => {
      setup();
      const name = "my dashboard";
      await userEvent.type(nameField(), name);
      await userEvent.click(collDropdown());
      await userEvent.click(await findNewCollBtn());
      expect(await screen.findByText("Give it a name")).toBeInTheDocument();
    });
  });
});
