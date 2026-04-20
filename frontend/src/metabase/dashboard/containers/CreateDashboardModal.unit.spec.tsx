import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupLibraryEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  createMockCollection,
  createMockCollectionItemFromCollection,
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

function setup({ mockCreateDashboardResponse = true } = {}) {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([]);
  setupLibraryEndpoints();
  setupDatabasesEndpoints([]);
  const onClose = jest.fn();

  const settings = mockSettings({});

  if (mockCreateDashboardResponse) {
    fetchMock.post(`path:/api/dashboard`, (call) => call?.options.body);
  }
  const collections = Object.values(COLLECTION);
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

  collections
    .filter((c) => c.id !== "root")
    .forEach((c) => fetchMock.get(`path:/api/collection/${c.id}`, c));

  renderWithProviders(<CreateDashboardModal opened onClose={onClose} />, {
    storeInitialState: {
      entities: createMockEntitiesState({ collections }),
      settings,
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

  it("displays empty form fields", () => {
    setup();

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(screen.getByText("Our analytics")).toBeInTheDocument();
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
