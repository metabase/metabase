import { renderWithProviders, screen } from "__support__/ui";
import type { LlmProviderTypeName } from "metabase-types/api";

import { ProviderTypeIcon } from "./ProviderTypeIcon";

describe("ProviderTypeIcon", () => {
  it("renders the Metabase logo for the managed provider", () => {
    renderWithProviders(<ProviderTypeIcon type="metabase" icon="metabot" />);

    expect(screen.getByTestId("main-logo")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it.each([
    "anthropic",
    "openai",
    "openrouter",
    "mistral",
    "zai",
    "azure",
    "bedrock",
  ] as const)("renders the vendor logo for %s", (type) => {
    renderWithProviders(<ProviderTypeIcon type={type} icon="ai" />);

    expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
    expect(screen.getByRole("presentation")).toBeInTheDocument();
  });

  it("falls back to the registry icon for a type the frontend does not know yet", () => {
    // the registry is the backend's, so it can serve a type this union does not list yet;
    // the cast reproduces that server response, which is unreachable through the type alone
    const unknownType = "gemini" as LlmProviderTypeName;
    renderWithProviders(<ProviderTypeIcon type={unknownType} icon="ai" />);

    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
