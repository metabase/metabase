import { renderWithProviders, screen } from "__support__/ui";
import FullAppEmbeddingLinkWidget from "./FullAppEmbeddingLinkWidget";

const setup = () => {
  renderWithProviders(<FullAppEmbeddingLinkWidget />);
};

describe("FullAppEmbeddingLinkWidget", () => {
  it("should add utm_media to the upgrade link", () => {
    setup();

    expect(
      screen.getByRole("link", { name: "some of our paid plans," }),
    ).toHaveAttribute("href", expect.stringContaining("embed_fullapp"));
  });
});
