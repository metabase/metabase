import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { FULL_APP_EMBEDDING_URL, setup } from "../setup";

import type { SetupOpts } from "./setup";
import {
  getInteractiveEmbeddingQuickStartLink,
  interactiveEmbeddingSettingsUrl,
  setupEmbedding,
  staticEmbeddingSettingsUrl,
} from "./setup";
import type { History } from "./types";

const setupPremium = (opts?: SetupOpts) => {
  fetchMock.put("path:/api/setting/enable-embedding-interactive", 204);
  return setupEmbedding({
    ...opts,
    hasEnterprisePlugins: true,
    hasEmbeddingFeature: true,
  });
};

describe("[EE, with token] embedding settings", () => {
  describe("when static embedding is disabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupPremium({
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

      it("should not prompt to upgrade to remove the Powered by text", async () => {
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        );
        expect(
          withinStaticEmbeddingCard.queryByText("upgrade to a paid plan"),
        ).not.toBeInTheDocument();
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
      await setupPremium({
        settingValues: {
          "enable-embedding-sdk": false,
          "embedding-app-origins-sdk": "metabase-sdk.com",
        },
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
          ).getByRole("button", { name: "Configure" }),
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
        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toHaveValue("metabase-sdk.com");
      });
    });
  });

  describe("when interactive embedding is disabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupPremium({
          settingValues: {
            "enable-embedding-interactive": false,
            "embedding-app-origin": "localhost:9999",
            "session-cookie-samesite": "strict",
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
        ).toBeEnabled();

        // should link to https://www.metabase.com/blog/why-full-app-embedding?utm_source=pro-self-hosted&utm_media=embed-settings
        expect(
          withinInteractiveEmbeddingCard.getByText(
            "offer multi-tenant, self-service analytics",
          ),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/blog/why-full-app-embedding?utm_source=pro-self-hosted&utm_media=embed-settings",
        );
      });

      it("should allow access to interactive embedding settings page", async () => {
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Interactive embedding",
          }),
        );
        expect(
          withinInteractiveEmbeddingCard.queryByRole("link", {
            name: "Learn More",
          }),
        ).not.toBeInTheDocument();

        await userEvent.click(
          withinInteractiveEmbeddingCard.getByRole("button", {
            name: "Configure",
          }),
        );

        expect(
          screen.getByLabelText("Enable Interactive embedding"),
        ).toBeEnabled();
        expect(
          screen.getByLabelText("Enable Interactive embedding"),
        ).not.toBeChecked();
        await userEvent.click(
          screen.getByLabelText("Enable Interactive embedding"),
        );

        expect(screen.getByLabelText("Authorized origins")).toBeEnabled();
        expect(screen.getByLabelText("Authorized origins")).toHaveValue(
          "localhost:9999",
        );

        expect(screen.getByText("SameSite cookie setting")).toBeInTheDocument();
        expect(
          screen.getByText("Strict (not recommended)"),
        ).toBeInTheDocument();

        expect(history.getCurrentLocation().pathname).toEqual(
          interactiveEmbeddingSettingsUrl,
        );
      });
    });
  });

  describe("when static embedding is enabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupPremium({
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

      it("should not prompt to upgrade to remove the Powered by text", async () => {
        const withinStaticEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Static embedding",
          }),
        );
        expect(
          withinStaticEmbeddingCard.queryByText("upgrade to a paid plan"),
        ).not.toBeInTheDocument();
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
      await setupPremium({
        settingValues: {
          "enable-embedding-sdk": true,
          "embedding-app-origins-sdk": "metabase-sdk.com",
        },
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
          ).getByRole("button", { name: "Configure" }),
        );

        expect(
          screen.getByLabelText("Enable Embedded analytics SDK"),
        ).toBeChecked();
        expect(
          screen.getByLabelText("Enable Embedded analytics SDK"),
        ).toBeEnabled();
        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeEnabled();
        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toHaveValue("metabase-sdk.com");
      });
    });
  });

  describe("when interactive embedding is enabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupPremium({
          settingValues: {
            "enable-embedding-interactive": true,
            "embedding-app-origin": "localhost:9999",
            "session-cookie-samesite": "strict",
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
          withinInteractiveEmbeddingCard.getByLabelText("Enabled"),
        ).toBeChecked();
        expect(
          withinInteractiveEmbeddingCard.getByLabelText("Enabled"),
        ).toBeEnabled();

        // should link to https://www.metabase.com/blog/why-full-app-embedding?utm_source=pro-self-hosted&utm_media=embed-settings
        expect(
          withinInteractiveEmbeddingCard.getByText(
            "offer multi-tenant, self-service analytics",
          ),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/blog/why-full-app-embedding?utm_source=pro-self-hosted&utm_media=embed-settings",
        );
      });

      it("should allow access to interactive embedding settings page", async () => {
        const withinInteractiveEmbeddingCard = within(
          screen.getByRole("article", {
            name: "Interactive embedding",
          }),
        );
        expect(
          withinInteractiveEmbeddingCard.queryByRole("link", {
            name: "Learn More",
          }),
        ).not.toBeInTheDocument();

        await userEvent.click(
          withinInteractiveEmbeddingCard.getByRole("button", {
            name: "Configure",
          }),
        );

        expect(
          screen.getByLabelText("Enable Interactive embedding"),
        ).toBeEnabled();
        expect(
          screen.getByLabelText("Enable Interactive embedding"),
        ).toBeChecked();
        await userEvent.click(
          screen.getByLabelText("Enable Interactive embedding"),
        );

        expect(screen.getByLabelText("Authorized origins")).toBeEnabled();
        expect(screen.getByLabelText("Authorized origins")).toHaveValue(
          "localhost:9999",
        );

        expect(screen.getByText("SameSite cookie setting")).toBeInTheDocument();
        expect(
          screen.getByText("Strict (not recommended)"),
        ).toBeInTheDocument();

        expect(history.getCurrentLocation().pathname).toEqual(
          interactiveEmbeddingSettingsUrl,
        );
      });
    });
  });

  it("should link to quickstart for interactive embedding", async () => {
    await setupPremium({
      settingValues: {
        "enable-embedding": false,
        version: { tag: "v1.49.3" },
      },
    });
    expect(getInteractiveEmbeddingQuickStartLink()).toBeInTheDocument();
    expect(getInteractiveEmbeddingQuickStartLink()).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/v0.49/embedding/interactive-embedding-quick-start-guide.html?utm_source=pro-self-hosted&utm_media=embed-settings",
    );
  });

  it("should not redirect users back to embedding settings page when visiting the full-app embedding page when embedding is not enabled", async () => {
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

    expect(screen.queryByText("Static embedding")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Embedded analytics SDK"),
    ).not.toBeInTheDocument();
  });
});
