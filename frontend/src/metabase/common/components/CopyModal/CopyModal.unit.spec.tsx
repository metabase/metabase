import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItemFromCollection,
} from "metabase-types/api/mocks";

import { CopyModal } from "./CopyModal";

const ROOT = createMockCollection({ ...ROOT_COLLECTION, can_write: true });
const FIRST_COLLECTION = createMockCollection({
  id: 9,
  name: "First collection",
  location: "/",
  can_write: true,
});

const setup = () => {
  mockGetBoundingClientRect();
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
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
  fetchMock.get("path:/api/user/recipients", { data: [] });

  const onClose = jest.fn();
  renderWithProviders(
    <CopyModal
      entityType="cards"
      entityObject={createMockCard({ id: 1, name: "Orders" })}
      copy={jest.fn()}
      onClose={onClose}
      onSaved={jest.fn()}
    />,
  );
  return { onClose };
};

describe("CopyModal", () => {
  it("should close the collection picker, then the modal, with the Escape key", async () => {
    const { onClose } = setup();

    await userEvent.click(
      await screen.findByLabelText(/Where do you want to save this/),
    );
    expect(
      await within(await screen.findByTestId("item-picker-level-1")).findByText(
        "First collection",
      ),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("entity-picker-modal"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: /Duplicate "Orders"/ }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
