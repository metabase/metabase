import { renderWithProviders, screen } from "__support__/ui";

import { ProviderTypeIcon } from "./ProviderTypeIcon";

describe("ProviderTypeIcon", () => {
  it("renders the Metabase logo for the managed provider", () => {
    renderWithProviders(<ProviderTypeIcon type="metabase" icon="metabot" />);

    expect(screen.getByTestId("main-logo")).toBeInTheDocument();
  });

  it.each([
    ["anthropic", "anthropic.svg"],
    ["mistral", "mistral.svg"],
  ] as const)("renders the vendor logo for %s", (type, file) => {
    renderWithProviders(<ProviderTypeIcon type={type} icon="ai" />);

    expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      `app/assets/img/llm-providers/${file}`,
    );
  });

  it("falls back to the registry icon for a provider with no vendor logo", () => {
    renderWithProviders(<ProviderTypeIcon type="zai" icon="ai" />);

    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
