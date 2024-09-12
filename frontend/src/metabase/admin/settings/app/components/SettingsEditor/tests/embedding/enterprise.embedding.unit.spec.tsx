import userEvent from "@testing-library/user-event";

import { act, screen, within } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { FULL_APP_EMBEDDING_URL, setup } from "../setup";

import type { SetupOpts } from "./setup";
import {
  embeddingSettingsUrl,
  getInteractiveEmbeddingQuickStartLink,
  interactiveEmbeddingSettingsUrl,
  setupEmbedding,
  staticEmbeddingSettingsUrl,
} from "./setup";
import type { History } from "./types";

const setupEnterprise = (opts?: SetupOpts) => {
  return setupEmbedding({
    ...opts,
    hasEnterprisePlugins: true,
    hasEmbeddingFeature: false,
  });
};

describe("[EE, no token] embedding settings", () => {
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
          withinStaticEmbeddingCard.getByText("upgrade to a paid plan"),
        ).toBeInTheDocument();

        expect(
          withinStaticEmbeddingCard.getByRole("link", {
            name: "upgrade to a paid plan",
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
      await setupEnterprise({
        settingValues: { "enable-embedding-sdk": false },
      });
    });

    describe("embedding SDK", () => {
      it("should show info about embedding SDK", async () => {
        const withinEmbeddingSdkCard = within(
          screen.getByRole("article", {
            name: "Embedding SDK for React",
          }),
        );

        expect(
          withinEmbeddingSdkCard.getByRole("heading", {
            name: "Embedding SDK for React",
          }),
        ).toBeInTheDocument();
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
              name: "Embedding SDK for React",
            }),
          ).getByRole("button", { name: "Try it out" }),
        );

        expect(
          screen.getByLabelText("Enable Embedding SDK for React"),
        ).not.toBeChecked();
        expect(
          screen.getByLabelText("Enable Embedding SDK for React"),
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
        await setupEnterprise({
          settingValues: { "enable-embedding-interactive": false },
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
        await setupEnterprise({
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
          withinStaticEmbeddingCard.getByText("upgrade to a paid plan"),
        ).toBeInTheDocument();

        expect(
          withinStaticEmbeddingCard.getByRole("link", {
            name: "upgrade to a paid plan",
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
      await setupEnterprise({
        settingValues: { "enable-embedding-sdk": true },
      });
    });

    describe("embedding SDK", () => {
      it("should show info about embedding SDK", async () => {
        const withinEmbeddingSdkCard = within(
          screen.getByRole("article", {
            name: "Embedding SDK for React",
          }),
        );

        expect(
          withinEmbeddingSdkCard.getByRole("heading", {
            name: "Embedding SDK for React",
          }),
        ).toBeInTheDocument();
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
              name: "Embedding SDK for React",
            }),
          ).getByRole("button", { name: "Try it out" }),
        );

        expect(
          screen.getByLabelText("Enable Embedding SDK for React"),
        ).toBeChecked();
        expect(
          screen.getByLabelText("Enable Embedding SDK for React"),
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
        await setupEnterprise({
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
    await setupEnterprise({
      settingValues: {
        "enable-embedding": false,
        version: { tag: "v0.49.3" },
      },
    });
    expect(getInteractiveEmbeddingQuickStartLink()).toBeInTheDocument();
    expect(getInteractiveEmbeddingQuickStartLink()).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/v0.49/embedding/interactive-embedding-quick-start-guide.html?utm_source=oss&utm_media=embed-settings",
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
      hasEnterprisePlugins: true,
      initialRoute: FULL_APP_EMBEDDING_URL,
    });

    expect(screen.getByText("Static embedding")).toBeInTheDocument();
    expect(screen.getByText("Embedding SDK for React")).toBeInTheDocument();
    expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
  });
});
