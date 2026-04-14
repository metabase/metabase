import { Route } from "react-router";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { MetabotNavPane } from "./MetabotNavPane";

const setup = ({
  isConfigured = true,
}: {
  isConfigured?: boolean;
} = {}) =>
  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotNavPane} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings: createMockSettingsState({
          "llm-metabot-configured?": isConfigured,
        }),
      },
    },
  );

const setupEmbeddingPlugin = () => {
  mockSettings({
    "token-features": createMockTokenFeatures({
      embedding_sdk: true,
    }),
  });
  setupEnterprisePlugins();
};

describe("MetabotNavPane", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should not show metabots if it isn't configured", async () => {
    setup({ isConfigured: false });

    expect(screen.queryByText("Metabot")).not.toBeInTheDocument();
    expect(screen.queryByText("Embedded Metabot")).not.toBeInTheDocument();
  });

  it("should show metabots if it is configured", async () => {
    setup({ isConfigured: true });

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(screen.queryByText("Embedded Metabot")).not.toBeInTheDocument();
  });

  it("should show Embedded Metabot with embedding_sdk feature", async () => {
    setupEmbeddingPlugin();
    setup({ isConfigured: true });

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(await screen.findByText("Embedded Metabot")).toBeInTheDocument();
  });

  it("should show Embedded Metabot with embedding_simple feature", async () => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        embedding_simple: true,
      }),
    });
    setupEnterprisePlugins();
    setup({ isConfigured: true });

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(await screen.findByText("Embedded Metabot")).toBeInTheDocument();
  });

  it("should not show AI controls nav items by default", async () => {
    setup({ isConfigured: true });

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(screen.queryByText("Usage controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Customization")).not.toBeInTheDocument();
    expect(screen.queryByText("System prompts")).not.toBeInTheDocument();
  });

  it("should show AI controls nav items when ai_controls plugin is enabled", async () => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        ai_controls: true,
      }),
    });
    setupEnterprisePlugins();
    setup({ isConfigured: true });

    expect(await screen.findByText("Metabot")).toBeInTheDocument();
    expect(screen.getByText("Usage controls")).toBeInTheDocument();
    expect(screen.getByText("Customization")).toBeInTheDocument();
    expect(screen.getByText("System prompts")).toBeInTheDocument();
  });

  it("should not show AI controls nav items when metabot is not configured", async () => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        ai_controls: true,
      }),
    });
    setupEnterprisePlugins();
    setup({ isConfigured: false });

    expect(screen.queryByText("Usage controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Customization")).not.toBeInTheDocument();
    expect(screen.queryByText("System prompts")).not.toBeInTheDocument();
  });
});
