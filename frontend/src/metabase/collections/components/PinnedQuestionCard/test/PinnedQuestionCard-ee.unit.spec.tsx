import { screen } from "__support__/ui";
import type { CollectionItem } from "metabase-types/api";

import { setup } from "./setup";

describe("moderated status", () => {
  it.each<Partial<CollectionItem>>([
    { model: "card" },
    { model: "card", collection_preview: false },
    { model: "metric" },
    { model: "dashboard" },
    { model: "dataset" },
  ])(
    "should display the correct icon when moderated_status is verified for the $model",
    async (collectionItem) => {
      setup(
        { ...collectionItem, moderated_status: "verified" },
        { enterprise: true },
      );

      expect(screen.getByRole("img", { name: /verified/ })).toBeInTheDocument();
    },
  );
});
