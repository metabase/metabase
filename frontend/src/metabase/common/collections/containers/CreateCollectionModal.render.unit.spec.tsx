import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import {
  createMockCollection,
  createMockCollectionItemFromCollection,
  createMockUser,
} from "metabase-types/api/mocks";

import CreateCollectionModal from "./CreateCollectionModal";

const ROOT = createMockCollection({ ...ROOT_COLLECTION, can_write: true });
const FIRST_COLLECTION = createMockCollection({
  id: 9,
  name: "First collection",
  location: "/",
  can_write: true,
});

const setup = () => {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([]);
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({
    collections: [ROOT, FIRST_COLLECTION],
    rootCollection: ROOT,
  });
  setupCollectionByIdEndpoint({ collections: [ROOT, FIRST_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: ROOT,
    collectionItems: [createMockCollectionItemFromCollection(FIRST_COLLECTION)],
  });
  setupCollectionItemsEndpoint({
    collection: FIRST_COLLECTION,
    collectionItems: [],
  });
  fetchMock.get("path:/api/user/recipients", { data: [] });

  const onClose = jest.fn();
  renderWithProviders(
    <Route path="/" element={<CreateCollectionModal onClose={onClose} />} />,
    {
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
  return { onClose };
};

describe("CreateCollectionModal", () => {
  it("should close the open dialogs one by one with the Escape key", async () => {
    const { onClose } = setup();

    await userEvent.click(
      await screen.findByLabelText(/Collection it's saved in/),
    );
    const newCollectionButton = await screen.findByRole("button", {
      name: /New collection/,
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
      screen.getByRole("dialog", { name: "New collection" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
