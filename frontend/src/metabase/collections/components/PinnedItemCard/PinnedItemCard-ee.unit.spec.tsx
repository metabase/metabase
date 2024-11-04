import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import PinnedItemCard from "./PinnedItemCard";

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

  setupEnterprisePlugins();

  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <PinnedItemCard
          item={item}
          collection={collection}
          createBookmark={jest.fn()}
          deleteBookmark={jest.fn()}
        />
      )}
    />,
    { withRouter: true, storeInitialState },
  );
}

describe("PinnedItemCard enterprise", () => {
  describe("models", () => {
    const model = createMockCollectionItem({
      id: 1,
      name: "Order",
      model: "dataset",
      moderated_status: "verified",
    });

    it("should show a verified badge next to the model name", () => {
      setup({ item: model });
      expect(screen.getByTestId("model-detail-link")).toBeInTheDocument();
      expect(screen.getByTestId("model-detail-link")).toHaveAttribute(
        "href",
        "/model/1-order/detail",
      );
      expect(
        screen.getByRole("img", { name: /verified_filled/ }),
      ).toBeInTheDocument();
    });
  });
});
