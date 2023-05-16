import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import EmbeddingCustomizationInfo from "./EmbeddingCustomizationInfo";

const setup = () => {
  renderWithProviders(<EmbeddingCustomizationInfo />);
};

describe("EmbeddingCustomizationInfo", () => {
  it("should add utm_media to the upgrade link", () => {
    setup();

    expect(
      screen.getByRole("link", { name: "one of our paid plans." }),
    ).toHaveAttribute("href", expect.stringContaining("embed_standalone"));
  });
});
