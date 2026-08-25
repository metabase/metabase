import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import type { LlmProviderTypeName } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { ProviderTypeIcon } from "./ProviderTypeIcon";

describe("ProviderTypeIcon", () => {
  afterEach(() => {
    reinitialize();
  });

  it("renders the Metabase logo for the managed provider", () => {
    renderWithProviders(<ProviderTypeIcon type="metabase" />);

    expect(screen.getByTestId("main-logo")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it.each([
    "anthropic",
    "openai",
    "openrouter",
    "mistral",
    "zai",
    "moonshot",
    "deepseek",
    "google",
    "azure",
    "bedrock",
  ] as const)("renders the vendor logo for %s", (type) => {
    renderWithProviders(<ProviderTypeIcon type={type} />);

    expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
    expect(screen.getByRole("presentation")).toBeInTheDocument();
  });

  it("falls back to a generic icon for vLLM, which is a server rather than a vendor", () => {
    renderWithProviders(<ProviderTypeIcon type="vllm" />);

    expect(screen.queryByTestId("main-logo")).not.toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("falls back to a generic icon for a type the frontend does not know yet", () => {
    // the registry is the backend's, so it can serve a type this union does not list yet;
    // the cast reproduces that server response, which is unreachable through the type alone
    const unknownType = "evilai" as LlmProviderTypeName;
    renderWithProviders(<ProviderTypeIcon type={unknownType} />);

    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("keeps the Metabase mark on a whitelabelled instance", () => {
    // mockSettings feeds the settings singleton hasPremiumFeature reads, so the token has to
    // land before the plugin initializes or it never registers its logo
    const settingsState = mockSettings(
      createMockSettings({
        "application-logo-url": "https://example.com/customer-logo.svg",
        "token-features": createMockTokenFeatures({ whitelabel: true }),
      }),
    );
    setupEnterpriseOnlyPlugin("whitelabel");

    renderWithProviders(<ProviderTypeIcon type="metabase" />, {
      storeInitialState: { settings: settingsState },
    });

    expect(screen.getByTestId("main-logo")).toBeInTheDocument();
  });
});
