import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupUpdateCollectionEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { EditCollectionModal } from "./EditCollectionModal";

const parentCollection = createMockCollection({
  id: 22,
  name: "Parent Collection",
  can_write: true,
});

const itemParentCollection = createMockCollection({
  id: 33,
  name: "Item Parent Collection",
  can_write: true,
});

function setup(collection: Collection | CollectionItem) {
  const onClose = jest.fn();
  const onSave = jest.fn();

  setupUpdateCollectionEndpoint(collection as Collection);
  setupCollectionByIdEndpoint({
    collections: [parentCollection, itemParentCollection],
  });

  renderWithProviders(
    <EditCollectionModal
      collection={collection}
      onClose={onClose}
      onSave={onSave}
    />,
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          collections: [parentCollection, itemParentCollection],
        }),
      }),
    },
  );

  return { onClose, onSave };
}

describe("EditCollectionModal", () => {
  it("submits collection details using Collection.parent_id", async () => {
    const collection = createMockCollection({
      id: 1,
      name: "Original name",
      description: "Original description",
      parent_id: parentCollection.id,
    });
    const { onClose, onSave } = setup(collection);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Updated name");
    await userEvent.clear(screen.getByLabelText("Description"));
    await userEvent.type(
      screen.getByLabelText("Description"),
      "Updated description",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      previousParentId: parentCollection.id,
      newParentId: parentCollection.id,
    });
    const request = fetchMock.callHistory.lastCall(
      "update-collection-1",
    )?.request;
    expect(await request?.json()).toEqual({
      name: "Updated name",
      description: "Updated description",
      parent_id: parentCollection.id,
    });
  });

  it("submits collection details using CollectionItem.collection_id", async () => {
    const collectionItem = createMockCollectionItem({
      id: 2,
      model: "collection",
      name: "Collection item",
      collection_id: itemParentCollection.id as number,
    }) as CollectionItem;
    const { onSave } = setup(collectionItem);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Updated item name");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      previousParentId: itemParentCollection.id,
      newParentId: itemParentCollection.id,
    });
    const request = fetchMock.callHistory.lastCall(
      "update-collection-2",
    )?.request;
    expect(await request?.json()).toEqual({
      name: "Updated item name",
      parent_id: itemParentCollection.id,
    });
  });
});
