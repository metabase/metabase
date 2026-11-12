import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { CompactPinnedItemCard } from "./CompactPinnedItemCard";

const defaultCollection = createMockCollection({
  can_write: true,
  id: 1,
  name: "Collection Foo",
  archived: false,
});

function setup({
  item,
  collection = defaultCollection,
}: {
  item: CollectionItem;
  collection?: Collection;
}) {
  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        remote_sync: true,
      }),
    }),
  });

  setupEnterpriseOnlyPlugin("remote_sync");

  return renderWithProviders(
    <Route
      path="/"
      element={
        <CompactPinnedItemCard
          item={item}
          collection={collection}
          createBookmark={jest.fn()}
          deleteBookmark={jest.fn()}
        />
      }
    />,
    { withRouter: true, storeInitialState },
  );
}

describe("CompactPinnedItemCard enterprise", () => {
  describe("models", () => {
    const model = createMockCollectionItem({
      id: 1,
      name: "Order",
      model: "dataset",
    });

    it("should show official badge next to model name in official collection", () => {
      setup({
        item: {
          ...model,
          collection: createMockCollection({ is_remote_synced: true }),
        },
      });
      expect(screen.getByTestId("official-badge")).toBeInTheDocument();
    });

    it("should not show official badge for model in regular collection", () => {
      setup({ item: model });
      expect(screen.queryByTestId("official-badge")).not.toBeInTheDocument();
    });
  });
});
