import { screen, waitFor } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("CreateCollectionForm", () => {
  it("does not show authority level controls", () => {
    setup();
    expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
  });

  it("hides authority level picker when initial parent is a shared tenant collection", async () => {
    setup({
      showAuthorityLevelPicker: true,
      tokenFeatures: createMockTokenFeatures({
        tenants: true,
        official_collections: true,
      }),
      enterprisePlugins: ["collections", "tenants"],
      parentCollectionNamespace: "shared-tenant-collection",
    });

    // Wait for the authority level picker to disappear after collection data loads
    await waitFor(() => {
      expect(screen.queryByText("Collection type")).not.toBeInTheDocument();
    });
  });

  it("shows authority level picker when initial parent is a regular collection", () => {
    setup({
      showAuthorityLevelPicker: true,
      tokenFeatures: createMockTokenFeatures({
        tenants: true,
        official_collections: true,
      }),
      enterprisePlugins: ["collections", "tenants"],
      parentCollectionNamespace: null,
    });

    // The authority level picker should be visible
    expect(screen.getByText("Collection type")).toBeInTheDocument();
  });
});
