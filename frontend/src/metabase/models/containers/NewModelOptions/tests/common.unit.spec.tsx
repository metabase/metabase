import { screen } from "__support__/ui";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { checkNotNull } from "metabase/utils/types";

import { setup } from "./setup";

const getLinkedCard = (link: HTMLElement) => {
  const [, hash] = checkNotNull(link.getAttribute("href")).split("#");
  return deserializeCardFromUrl(hash);
};

describe("NewModelOptions (OSS)", () => {
  it("should render no data access notice when instance have no database access", async () => {
    setup({ canCreateQueries: false });

    expect(
      await screen.findByText("Metabase is no fun without any data"),
    ).toBeInTheDocument();
  });

  describe("has data access", () => {
    it("should render options for creating a model", async () => {
      setup({ canCreateQueries: true, canCreateNativeQueries: true });

      expect(
        await screen.findByText("Use the notebook editor"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Use a native query")).toBeInTheDocument();
    });

    it("opens a native model on the last used native database", async () => {
      setup({ canCreateNativeQueries: true, lastUsedDatabaseId: 2 });

      const card = getLinkedCard(
        await screen.findByRole("link", { name: /Use a native query/ }),
      );
      expect(card.type).toBe("model");
      expect(card.dataset_query.database).toBe(2);
    });

    it("opens a native model without a database when none was used before", async () => {
      setup({ canCreateNativeQueries: true, lastUsedDatabaseId: null });

      const card = getLinkedCard(
        await screen.findByRole("link", { name: /Use a native query/ }),
      );
      expect(card.dataset_query.database).toBeNull();
    });

    describe("whitelabel feature", () => {
      it("should render help link when `show-metabase-links: false`", async () => {
        setup({ canCreateQueries: true, showMetabaseLinks: false });

        expect(await screen.findByText("What's a model?")).toBeInTheDocument();
      });

      it("should render help link when `show-metabase-links: true`", async () => {
        setup({ canCreateQueries: true, showMetabaseLinks: true });

        expect(await screen.findByText("What's a model?")).toBeInTheDocument();
      });
    });
  });
});
