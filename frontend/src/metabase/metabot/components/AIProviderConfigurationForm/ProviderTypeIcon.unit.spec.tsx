import { renderWithProviders, screen } from "__support__/ui";

import { ProviderTypeIcon } from "./ProviderTypeIcon";

describe("ProviderTypeIcon", () => {
  it("renders the Metabase logo for the managed provider", () => {
    renderWithProviders(<ProviderTypeIcon type="metabase" icon="metabot" />);

    expect(screen.getByTestId("main-logo")).toBeInTheDocument();
  });

  it("renders the vendor logo for a provider that ships one", () => {
    renderWithProviders(<ProviderTypeIcon type="anthropic" icon="ai" />);

    expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "app/assets/img/llm-providers/anthropic.svg",
    );
  });
});
