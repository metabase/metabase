import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { EmbeddingThemeListingApp } from "./EmbeddingThemeListingApp";

const setup = ({
  showHeading = true,
}: {
  showHeading?: boolean;
} = {}) => {
  fetchMock.get("path:/api/embed-theme", []);

  renderWithProviders(<EmbeddingThemeListingApp showHeading={showHeading} />, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
    },
  });
};

/**
 * The two upsell tests this file used to carry are gone: the component no
 * longer checks `embedding_simple` or renders UpsellEmbeddingTheme -- its
 * caller gates it and shows the upsell instead. theme-upsell.cy.spec.ts covers
 * that end to end, per edition.
 */
describe("EmbeddingThemeListingApp", () => {
  it("renders the themes listing", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "Themes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /New theme/ }),
    ).toBeInTheDocument();
  });

  it("leaves the heading out for a host that titles the page itself", async () => {
    setup({ showHeading: false });

    expect(
      await screen.findByRole("button", { name: /New theme/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Themes" }),
    ).not.toBeInTheDocument();
  });
});
