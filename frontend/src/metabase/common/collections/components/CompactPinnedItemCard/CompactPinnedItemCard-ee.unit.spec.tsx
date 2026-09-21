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
        content_verification: true,
      }),
    }),
  });

  setupEnterpriseOnlyPlugin("content_verification");
  setupEnterpriseOnlyPlugin("moderation");

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
      moderated_status: "verified",
    });

    it("should show a verified badge next to the model name", () => {
      setup({ item: model });
      expect(
        screen.getByRole("img", { name: /verified_filled/ }),
      ).toBeInTheDocument();
    });
  });
});
