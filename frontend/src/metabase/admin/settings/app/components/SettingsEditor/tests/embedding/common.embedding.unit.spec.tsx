import userEvent from "@testing-library/user-event";

import { act, screen, within } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { FULL_APP_EMBEDDING_URL, setup } from "../setup";

import {
  embeddingSettingsUrl,
  getInteractiveEmbeddingQuickStartLink,
  interactiveEmbeddingSettingsUrl,
  setupEmbedding,
  staticEmbeddingSettingsUrl,
} from "./setup";
import type { History } from "./types";

describe("[OSS] embedding settings", () => {
  describe("when static embedding is disabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupEmbedding({
          settingValues: { "enable-embedding-static": false },
        })
      ).history;
    });

    describe("static embedding", () => {
      it("should show info about static embedding", async () => {
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        );

        expect(
          withinStaticEmbeddingCard.getByRole("heading", {
            name: "Static embedding",
          }),
        ).toBeInTheDocument();
        expect(
          withinStaticEmbeddingCard.getByText(/Use static embedding when/),
        ).toBeInTheDocument();

        expect(
          withinStaticEmbeddingCard.getByLabelText("Disabled"),
        ).not.toBeChecked();
        expect(
          withinStaticEmbeddingCard.getByLabelText("Disabled"),
        ).toBeEnabled();
      });

      it("should prompt to upgrade to remove the Powered by text", async () => {
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        );
        expect(
          withinStaticEmbeddingCard.getByText(
            "upgrade to a specific paid plan",
          ),
        ).toBeInTheDocument();

        expect(
          withinStaticEmbeddingCard.getByRole("link", {
            name: "upgrade to a specific paid plan",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_content=embed-settings&source_plan=oss",
        );
      });

      it("should allow access to static embedding settings page", async () => {
        // Go to static embedding settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Static embedding",
            }),
          ).getByRole("button", { name: "Manage" }),
        );

        const staticEmbeddingToggle = screen.getByLabelText(
          "Enable Static embedding",
        );
        expect(staticEmbeddingToggle).toBeEnabled();
        expect(staticEmbeddingToggle).not.toBeChecked();

        expect(screen.getByText("Embedding secret key")).toBeInTheDocument();
        expect(screen.getByText("Manage embeds")).toBeInTheDocument();

        const location = history.getCurrentLocation();
        expect(location.pathname).toEqual(staticEmbeddingSettingsUrl);
      });
    });
  });

  describe("when embedding SDK is disabled", () => {
    beforeEach(async () => {
      await setupEmbedding({
        settingValues: { "enable-embedding-sdk": false },
      });
    });

    describe("embedding SDK", () => {
      it("should show info about embedding SDK", async () => {
        const withinEmbeddingSdkCard = within(
          screen.getByRole("article", {
            name: "Embedded analytics SDK",
          }),
        );

        expect(
          withinEmbeddingSdkCard.getByRole("heading", {
            name: "Embedded analytics SDK",
          }),
        ).toBeInTheDocument();
        expect(withinEmbeddingSdkCard.getByText("Beta")).toBeInTheDocument();
        expect(
          withinEmbeddingSdkCard.getByText(
            /Interactive embedding with full, granular control./,
          ),
        ).toBeInTheDocument();
        expect(
          withinEmbeddingSdkCard.getByLabelText("Disabled"),
        ).not.toBeChecked();
        expect(withinEmbeddingSdkCard.getByLabelText("Disabled")).toBeEnabled();
      });

      it("should allow access to embedding SDK settings page", async () => {
        // Go to embedding SDK settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Embedded analytics SDK",
            }),
          ).getByRole("button", { name: "Try it out" }),
        );

        expect(
          screen.getByLabelText("Enable Embedded analytics SDK"),
        ).not.toBeChecked();
        expect(
          screen.getByLabelText("Enable Embedded analytics SDK"),
        ).toBeEnabled();
        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeDisabled();
      });
    });
  });

  describe("when interactive embedding is disabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupEmbedding({
          settingValues: {
            "enable-embedding-interactive": false,
          },
        })
      ).history;
    });

    describe("interactive embedding", () => {
      it("should show info about interactive embedding", async () => {
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Interactive embedding",
          }),
        );

        expect(
          withinInteractiveEmbeddingCard.getByRole("heading", {
            name: "Interactive embedding",
          }),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByText(
            /Use interactive embedding when/,
          ),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByLabelText("Disabled"),
        ).not.toBeChecked();
        expect(
          withinInteractiveEmbeddingCard.getByLabelText("Disabled"),
        ).toBeDisabled();

        // should link to https://www.metabase.com/blog/why-full-app-embedding?utm_source=oss&utm_media=embed-settings
        expect(
          withinInteractiveEmbeddingCard.getByText(
            "offer multi-tenant, self-service analytics",
          ),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/blog/why-full-app-embedding?utm_source=oss&utm_media=embed-settings",
        );

        // should have a learn more button for interactive embedding
        expect(
          withinInteractiveEmbeddingCard.getByRole("link", {
            name: "Learn More",
          }),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByRole("link", {
            name: "Learn More",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=embed-settings",
        );
      });

      it("should not allow access to interactive embedding settings page", async () => {
        act(() => {
          history.push(interactiveEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });
    });
  });

  describe("when static embedding is enabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupEmbedding({
          settingValues: { "enable-embedding-static": true },
        })
      ).history;
    });

    describe("static embedding", () => {
      it("should show info about static embedding", async () => {
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        );

        expect(
          withinStaticEmbeddingCard.getByRole("heading", {
            name: "Static embedding",
          }),
        ).toBeInTheDocument();
        expect(
          withinStaticEmbeddingCard.getByText(/Use static embedding when/),
        ).toBeInTheDocument();

        expect(
          withinStaticEmbeddingCard.getByLabelText("Enabled"),
        ).toBeChecked();
        expect(
          withinStaticEmbeddingCard.getByLabelText("Enabled"),
        ).toBeEnabled();
      });

      it("should prompt to upgrade to remove the Powered by text", async () => {
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        );
        expect(
          withinStaticEmbeddingCard.getByText(
            "upgrade to a specific paid plan",
          ),
        ).toBeInTheDocument();

        expect(
          withinStaticEmbeddingCard.getByRole("link", {
            name: "upgrade to a specific paid plan",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_content=embed-settings&source_plan=oss",
        );
      });

      it("should allow access to static embedding settings page", async () => {
        // Go to static embedding settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Static embedding",
            }),
          ).getByRole("button", { name: "Manage" }),
        );

        const staticEmbeddingToggle = screen.getByLabelText(
          "Enable Static embedding",
        );
        expect(staticEmbeddingToggle).toBeEnabled();
        expect(staticEmbeddingToggle).toBeChecked();

        expect(screen.getByText("Embedding secret key")).toBeInTheDocument();
        expect(screen.getByText("Manage embeds")).toBeInTheDocument();

        const location = history.getCurrentLocation();
        expect(location.pathname).toEqual(staticEmbeddingSettingsUrl);
      });
    });
  });

  describe("when embedding SDK is enabled", () => {
    beforeEach(async () => {
      await setupEmbedding({
        settingValues: { "enable-embedding-sdk": true },
      });
    });

    describe("embedding SDK", () => {
      it("should show info about embedding SDK", async () => {
        const withinEmbeddingSdkCard = within(
          screen.getByRole("article", {
            name: "Embedded analytics SDK",
          }),
        );

        expect(
          withinEmbeddingSdkCard.getByRole("heading", {
            name: "Embedded analytics SDK",
          }),
        ).toBeInTheDocument();
        expect(withinEmbeddingSdkCard.getByText("Beta")).toBeInTheDocument();
        expect(
          withinEmbeddingSdkCard.getByText(
            /Interactive embedding with full, granular control./,
          ),
        ).toBeInTheDocument();
        expect(withinEmbeddingSdkCard.getByLabelText("Enabled")).toBeChecked();
        expect(withinEmbeddingSdkCard.getByLabelText("Enabled")).toBeEnabled();
      });

      it("should allow access to embedding SDK settings page", async () => {
        // Go to embedding SDK settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Embedded analytics SDK",
            }),
          ).getByRole("button", { name: "Try it out" }),
        );

        expect(
          screen.getByLabelText("Enable Embedded analytics SDK"),
        ).toBeChecked();
        expect(
          screen.getByLabelText("Enable Embedded analytics SDK"),
        ).toBeEnabled();
        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeDisabled();
      });
    });
  });

  describe("when interactive embedding is enabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupEmbedding({
          settingValues: { "enable-embedding-interactive": true },
        })
      ).history;
    });

    describe("interactive embedding", () => {
      it("should show info about interactive embedding", async () => {
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Interactive embedding",
          }),
        );

        expect(
          withinInteractiveEmbeddingCard.getByRole("heading", {
            name: "Interactive embedding",
          }),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByText(
            /Use interactive embedding when/,
          ),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByLabelText("Enabled"),
        ).toBeChecked();
        expect(
          withinInteractiveEmbeddingCard.getByLabelText("Enabled"),
        ).toBeDisabled();

        // should link to https://www.metabase.com/blog/why-full-app-embedding?utm_source=oss&utm_media=embed-settings
        expect(
          withinInteractiveEmbeddingCard.getByText(
            "offer multi-tenant, self-service analytics",
          ),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/blog/why-full-app-embedding?utm_source=oss&utm_media=embed-settings",
        );

        // should have a learn more button for interactive embedding
        expect(
          withinInteractiveEmbeddingCard.getByRole("link", {
            name: "Learn More",
          }),
        ).toBeInTheDocument();
        expect(
          withinInteractiveEmbeddingCard.getByRole("link", {
            name: "Learn More",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=embed-settings",
        );
      });

      it("should not allow access to interactive embedding settings page", async () => {
        expect(
          screen.queryByRole("button", { name: "Configure" }),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: "Learn More" }),
        ).toBeInTheDocument();

        act(() => {
          history.push(interactiveEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });
    });
  });

  it("should link to quickstart for interactive embedding", async () => {
    await setupEmbedding({
      settingValues: {
        "enable-embedding": false,
        version: { tag: "v0.49.3" },
      },
    });
    expect(getInteractiveEmbeddingQuickStartLink()).toBeInTheDocument();
    expect(getInteractiveEmbeddingQuickStartLink()).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/v0.49/embedding/interactive-embedding-quick-start-guide.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-interactive&utm_content=embedding-admin&source_plan=oss",
    );
  });

  it("should redirect users back to embedding settings page when visiting the full-app embedding page when embedding is not enabled", async () => {
    await setup({
      settings: [createMockSettingDefinition({ key: "enable-embedding" })],
      settingValues: createMockSettings({ "enable-embedding": false }),
      tokenFeatures: createMockTokenFeatures({
        embedding: false,
        embedding_sdk: false,
      }),
      hasEnterprisePlugins: false,
      initialRoute: FULL_APP_EMBEDDING_URL,
    });

    expect(screen.getByText("Static embedding")).toBeInTheDocument();
    expect(screen.getByText("Embedded analytics SDK")).toBeInTheDocument();
    expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
  });

  describe("self-hosted (OSS)", () => {
    beforeEach(async () => {
      await setupEmbedding({
        isHosted: false,
        settingValues: { "is-hosted?": false },
      });

      // Go to embedding SDK settings page
      await userEvent.click(
        within(
          screen.getByRole("article", {
            name: "Embedded analytics SDK",
          }),
        ).getByRole("button", { name: "Try it out" }),
      );
    });

    describe("Embedding SDK settings page", () => {
      it("should show API key banner", () => {
        const apiKeyBanner = screen.getByText(
          /You can test Embedded analytics SDK/,
        );
        expect(apiKeyBanner).toHaveTextContent(
          "You can test Embedded analytics SDK on localhost quickly by using API keys. To use the SDK on other sites, switch Metabase binaries, upgrade to Metabase Pro and implement JWT SSO.",
        );

        const withinApiKeyBanner = within(apiKeyBanner);
        expect(
          withinApiKeyBanner.getByRole("link", {
            name: "switch Metabase binaries",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/docs/latest/paid-features/activating-the-enterprise-edition.html?utm_source=product&utm_medium=docs&utm_campaign=embedding-sdk&utm_content=embedding-sdk-admin&source_plan=oss",
        );
        expect(
          withinApiKeyBanner.getByRole("link", {
            name: "upgrade to Metabase Pro",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_campaign=embedding-sdk&utm_content=embedding-sdk-admin&source_plan=oss",
        );
        expect(
          withinApiKeyBanner.getByRole("link", {
            name: "implement JWT SSO",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/learn/metabase-basics/embedding/securing-embeds?utm_source=product&utm_medium=docs&utm_campaign=embedding-sdk&utm_content=embedding-sdk-admin&source_plan=oss",
        );
      });

      it("should show quick start section", () => {
        expect(
          screen.getByText("Try Embedded analytics SDK"),
        ).toBeInTheDocument();
        expect(
          screen.getByText("Use the SDK with API keys for development."),
        ).toBeInTheDocument();

        expect(
          screen.getByRole("link", { name: "Check out the Quick Start" }),
        ).toHaveProperty(
          "href",
          "https://metaba.se/sdk-quick-start?utm_source=product&utm_medium=docs&utm_campaign=embedding-sdk&utm_content=embedding-sdk-admin&source_plan=oss",
        );
      });

      it("should show CORS settings", () => {
        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeInTheDocument();
        const corsSettingDescription = screen.getByText(
          /Try out the SDK on localhost. To enable other sites/,
        );
        expect(corsSettingDescription).toHaveTextContent(
          "Try out the SDK on localhost. To enable other sites, upgrade to Metabase Pro and Enter the origins for the websites or apps where you want to allow SDK embedding.",
        );

        expect(
          within(corsSettingDescription).getByRole("link", {
            name: "upgrade to Metabase Pro",
          }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_campaign=embedding-sdk&utm_content=embedding-sdk-admin&source_plan=oss",
        );
      });

      it("should show documentation link", () => {
        const documentationText = screen.getByTestId("sdk-documentation");
        expect(documentationText).toHaveTextContent(
          "Check out the documentation for more.",
        );

        expect(
          within(documentationText).getByRole("link", {
            name: "documentation",
          }),
        ).toHaveProperty(
          "href",
          "https://metaba.se/sdk-docs?utm_source=product&utm_medium=docs&utm_campaign=embedding-sdk&utm_content=embedding-sdk-admin&source_plan=oss",
        );
      });

      it("should not show version pinning section", () => {
        expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
        expect(
          screen.queryByText(
            "Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.",
          ),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("link", { name: "Request version pinning" }),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("when environment variables are set", () => {
    it("should show `Set by environment variable` when the enable-embedding-static is an env var", async () => {
      await setupEmbedding({
        settingValues: { "enable-embedding-static": true },
        isEnvVar: true,
      });

      const withinStaticEmbeddingCard = within(
        screen.getByRole("article", {
          name: "Static embedding",
        }),
      );
      expect(
        withinStaticEmbeddingCard.getByText("Set via environment variable"),
      ).toBeVisible();
    });

    it("should show `Set by environment variable` when the enable-embedding-sdk is an env var", async () => {
      await setupEmbedding({
        settingValues: { "enable-embedding-sdk": true },
        isEnvVar: true,
      });

      const withinEmbeddingSdkCard = within(
        screen.getByRole("article", {
          name: "Embedded analytics SDK",
        }),
      );
      expect(
        withinEmbeddingSdkCard.getByText("Set via environment variable"),
      ).toBeVisible();
    });

    it("should show `Set by environment variable` when the enable-embedding-interactive is an env var", async () => {
      await setupEmbedding({
        settingValues: { "enable-embedding-interactive": true },
        isEnvVar: true,
      });

      const withinInteractiveEmbeddingCard = within(
        screen.getByRole("article", {
          name: "Interactive embedding",
        }),
      );
      expect(
        withinInteractiveEmbeddingCard.getByText(
          "Set via environment variable",
        ),
      ).toBeVisible();
    });

    it("should show `Set by environment variable` when the embedding-app-origins-sdk is an env var", async () => {
      await setupEmbedding({
        settingValues: { "embedding-app-origins-sdk": null },
        isEnvVar: true,
      });

      const withinEmbeddingSdkCard = within(
        screen.getByRole("article", {
          name: "Embedded analytics SDK",
        }),
      );

      await userEvent.click(withinEmbeddingSdkCard.getByText("Try it out"));

      expect(screen.getByText(/this has been set by the/i)).toBeInTheDocument();
      expect(
        screen.getByText(/embedding-app-origins-sdk/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/environment variable/i)).toBeInTheDocument();
    });
  });
});
