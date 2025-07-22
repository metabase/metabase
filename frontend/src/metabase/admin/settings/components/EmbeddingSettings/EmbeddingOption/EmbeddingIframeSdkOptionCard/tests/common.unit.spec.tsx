import {
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { createMockSettingDefinition } from "metabase-types/api/mocks";

import { EmbeddingIframeSdkOptionCard } from "../EmbeddingIframeSdkOptionCard";

import { setup as baseSetup } from "./setup";

const setup = ({
  isEmbeddingEnabled = false,
}: { isEmbeddingEnabled?: boolean } = {}) => {
  const { state } = baseSetup({ hasEnterprisePlugins: false });

  const settings = [
    createMockSettingDefinition({
      key: "enable-embedding-iframe-sdk",
      value: isEmbeddingEnabled,
    }),
    createMockSettingDefinition({
      key: "show-sdk-embed-terms",
      value: true,
    }),
  ];

  setupSettingsEndpoints(settings);
  setupUpdateSettingEndpoint();

  // Mock PLUGIN_EMBEDDING for non-EE
  jest.spyOn(PLUGIN_EMBEDDING, "isEnabled").mockReturnValue(false);

  return { state };
};

describe("EmbeddingIframeSdkOptionCard (OSS)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("displays the embed card", () => {
    const { state } = setup();
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });

    expect(
      screen.getByText("Embedded analytics SDK for iframe"),
    ).toBeInTheDocument();

    expect(screen.getByText("Pro and Enterprise")).toBeInTheDocument();
  });

  it("shows 'Try it out' button for non-EE instances", () => {
    const { state } = setup();
    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });

    expect(
      screen.getByRole("button", { name: "Try it out" }),
    ).toBeInTheDocument();
  });

  it("displays 'Disabled' when iframe embedding SDK is disabled", async () => {
    const { state } = setup({ isEmbeddingEnabled: false });

    renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
      storeInitialState: state,
    });

    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeInTheDocument();
    });

    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });
});
