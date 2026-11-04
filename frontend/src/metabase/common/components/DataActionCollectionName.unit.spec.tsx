import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { DataActionCollectionName } from "./DataActionCollectionName";

describe("DataActionCollectionName", () => {
  it("names the root after data actions", () => {
    renderWithProviders(<DataActionCollectionName id="root" />);

    expect(screen.getByText("Data actions")).toBeInTheDocument();
  });

  it("shows the name of a data actions folder", async () => {
    const folder = createMockCollection({
      id: 12,
      name: "Billing",
      namespace: "data-actions",
    });
    setupCollectionByIdEndpoint({ collections: [folder] });

    renderWithProviders(<DataActionCollectionName id={12} />);

    expect(await screen.findByText("Billing")).toBeInTheDocument();
  });
});
