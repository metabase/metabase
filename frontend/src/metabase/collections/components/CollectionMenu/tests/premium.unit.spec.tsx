import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getIcon, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { assertIndicatorHidden, assertIndicatorVisible, setup } from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  return setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      collection_cleanup: true,
    }),
    enterprisePlugins: ["collections", "clean_up"],
  });
};

describe("CollectionMenu", () => {
  describe("collection cleanup", () => {
    it("should show an indicator if the collection has stale items", async () => {
      setupPremium({
        collection: createMockCollection({ can_write: true }),
        isAdmin: true,
        numberOfStaleItems: 10,
      });

      await assertIndicatorVisible();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.callHistory.calls(
          "http://localhost/api/user-key-value/namespace/indicator-menu/key/collection-menu",
          { method: "PUT" },
        ),
      ).toHaveLength(1);

      expect(
        await screen.findByRole("menuitem", { name: /Clear out unused items/ }),
      ).toHaveTextContent("Recommended");
    });

    it("should not show an indicator if it has previously been dismissed, even if we recommend cleaning the collection", async () => {
      setupPremium({
        collection: createMockCollection({ can_write: true }),
        isAdmin: true,
        numberOfStaleItems: 10,
        seenBadges: ["clean-stale-items"],
      });

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.callHistory.calls(
          "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/collection-menu",
          { method: "PUT" },
        ),
      ).toHaveLength(0);

      expect(
        await screen.findByRole("menuitem", { name: /Clear out unused items/ }),
      ).toHaveTextContent("Recommended");
    });

    it("should recommend cleaning collections to non-admins with write access", async () => {
      setupPremium({
        collection: createMockCollection({ can_write: true }),
        isAdmin: false,
        numberOfStaleItems: 10,
      });

      await userEvent.click(getIcon("ellipsis"));

      expect(
        await screen.findByRole("menuitem", { name: /Clear out unused items/ }),
      ).toHaveTextContent("Recommended");
    });

    it("should not show an indicator if there are no stale items in the collection", async () => {
      setupPremium({
        collection: createMockCollection({ can_write: true }),
        isAdmin: true,
        numberOfStaleItems: 0,
      });

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls("express:/api/ee/stale/:id"),
        ).toHaveLength(1),
      );

      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(
            "http://localhost/api/user-key-value/namespace/indicator-menu/key/collection-menu",
            { method: "GET" },
          ),
        ).toHaveLength(1),
      );
      await waitFor(() =>
        expect(
          fetchMock.callHistory.calls(
            "http://localhost/api/user-key-value/namespace/user_acknowledgement/key/clean-stale-items",
            { method: "GET" },
          ),
        ).toHaveLength(1),
      );

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.callHistory.calls(
          "http://localhost/api/user-key-value/namespace/indicator-menu/key/collection-menu",
          { method: "PUT" },
        ),
      ).toHaveLength(0);

      expect(
        await screen.findByRole("menuitem", { name: /Clear out unused items/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Clear out unused items/ }),
      ).not.toHaveTextContent("Recommended");
    });

    it("should not make a request for stale items if the user cannot clean up the collection", async () => {
      setupPremium({
        collection: createMockCollection({ type: "trash" }),
        isAdmin: false,
      });

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.callHistory.calls("path:/api/collection/1/items"),
      ).toHaveLength(0);
      expect(
        fetchMock.callHistory.calls("express:/api/ee/stale/:id"),
      ).toHaveLength(0);

      expect(
        screen.queryByRole("menuitem", { name: /Clear out unused items/ }),
      ).not.toBeInTheDocument();
    });

    it("shound not show the clean up collection option if there are no items in the collection", async () => {
      setupPremium({
        collection: createMockCollection({ can_write: true }),
        isAdmin: true,
        numberOfCollectionItems: 0,
        numberOfStaleItems: 0,
      });

      await assertIndicatorHidden();
      await userEvent.click(getIcon("ellipsis"));

      expect(
        fetchMock.callHistory.calls("express:/api/ee/stale/:id"),
      ).toHaveLength(0);

      expect(
        screen.queryByRole("menuitem", { name: /Clear out unused items/ }),
      ).not.toBeInTheDocument();
    });
  });
});
