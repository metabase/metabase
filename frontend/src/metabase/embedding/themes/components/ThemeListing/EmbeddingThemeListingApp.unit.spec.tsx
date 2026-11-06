import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { EmbeddingThemeListingApp } from "./EmbeddingThemeListingApp";

const setup = () => {
  fetchMock.get("path:/api/embed-theme", []);

  renderWithProviders(
    <EmbeddingThemeListingApp basePath="/embedding/appearance/theme" />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
};

/**
 * The two upsell tests this file used to carry are gone: the component no
 * longer checks `embedding_simple` -- its caller gates it and shows the
 * upsell instead. theme-upsell.cy.spec.ts covers that end to end, per edition.
 */
describe("EmbeddingThemeListingApp", () => {
  it("renders the themes listing", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: /New theme/ }),
    ).toBeInTheDocument();
  });

  it("leaves the heading to the host page", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: /New theme/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Themes" }),
    ).not.toBeInTheDocument();
  });
});
