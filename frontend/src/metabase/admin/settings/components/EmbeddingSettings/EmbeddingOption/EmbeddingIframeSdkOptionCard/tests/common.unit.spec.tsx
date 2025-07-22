import {
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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

  renderWithProviders(<EmbeddingIframeSdkOptionCard />, {
    storeInitialState: state,
  });
};

describe("EmbeddingIframeSdkOptionCard (OSS)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the embed card", () => {
    setup();

    expect(
      screen.getByText("Embedded analytics SDK for iframe"),
    ).toBeInTheDocument();

    expect(screen.getByText("Pro and Enterprise")).toBeInTheDocument();
  });

  it("shows 'Try it out' button for non-EE instances", () => {
    setup();

    expect(
      screen.getByRole("button", { name: "Try it out" }),
    ).toBeInTheDocument();
  });
});
