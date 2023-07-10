import { renderWithProviders, screen } from "__support__/ui";
import { EmbeddingCustomizationWidget } from "./EmbeddingCustomizationWidget";

const setup = () => {
  renderWithProviders(<EmbeddingCustomizationWidget />);
};

describe("EmbeddingCustomizationWidget", () => {
  it("should add utm_media to the upgrade link", () => {
    setup();

    expect(
      screen.getByRole("link", { name: "one of our paid plans." }),
    ).toHaveAttribute("href", expect.stringContaining("embed_standalone"));
  });
});
