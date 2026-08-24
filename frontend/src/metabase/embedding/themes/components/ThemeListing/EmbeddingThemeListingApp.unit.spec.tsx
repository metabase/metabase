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
