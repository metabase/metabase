import userEvent from "@testing-library/user-event";

import { act, screen, within } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { FULL_APP_EMBEDDING_URL, setup } from "../setup";

import {
  embeddingSettingsUrl,
  getQuickStartLink,
  goToStaticEmbeddingSettings,
  interactiveEmbeddingSettingsUrl,
  setupEmbedding,
  staticEmbeddingSettingsUrl,
} from "./setup";
import type { History } from "./types";

describe("[OSS] embedding settings", () => {
  describe("when the embedding is disabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupEmbedding({
          settingValues: { "enable-embedding": false },
        })
      ).history;
    });

    describe("static embedding", () => {
      it("should not allow going to static embedding settings page", async () => {
        expect(screen.getByRole("button", { name: "Manage" })).toBeDisabled();

        act(() => {
          history.push(staticEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });

      it("should prompt to upgrade to remove the Powered by text", async () => {
        expect(screen.getByText("upgrade to a paid plan")).toBeInTheDocument();

        expect(
          screen.getByRole("link", { name: "upgrade to a paid plan" }),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_content=embed-settings&source_plan=oss",
        );
      });

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
      });

      it("should not allow access to the static embedding settings page", async () => {
        // Go to static embedding settings page
        expect(
          within(
            screen.getByRole("article", {
              name: "Static embedding",
            }),
          ).getByRole("button", { name: "Manage" }),
        ).toBeDisabled();
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive settings page", async () => {
        act(() => {
          history.push(interactiveEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });

      it("should have a learn more button for interactive embedding", async () => {
        expect(
          screen.getByRole("link", { name: "Learn More" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Learn More" })).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=embed-settings",
        );
      });

      it("should link to https://www.metabase.com/blog/why-full-app-embedding?utm_source=oss&utm_media=embed-settings", async () => {
        expect(
          screen.getByText("offer multi-tenant, self-service analytics"),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/blog/why-full-app-embedding?utm_source=oss&utm_media=embed-settings",
        );
      });
    });
  });

  describe("when the embedding SDK is disabled", () => {
    beforeEach(async () => {
      await setupEmbedding({
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

      it("should allow access to the embedding SDK settings page", async () => {
        // Go to embedding SDK settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Embedding SDK for React",
            }),
          ).getByRole("button", { name: "Try it out" }),
        );

        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeDisabled();
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
    expect(getQuickStartLink()).toBeInTheDocument();
    expect(getQuickStartLink()).toHaveProperty(
      "href",
      "https://www.metabase.com/docs/v0.49/embedding/interactive-embedding-quick-start-guide.html?utm_source=oss&utm_media=embed-settings",
    );
  });

  it("should redirect users back to embedding settings page when visiting the full-app embedding page when embedding is not enabled", async () => {
    await setup({
      settings: [createMockSettingDefinition({ key: "enable-embedding" })],
      settingValues: createMockSettings({ "enable-embedding": false }),
      initialRoute: FULL_APP_EMBEDDING_URL,
    });

    expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
    expect(screen.getByText(/Embed dashboards, questions/)).toBeInTheDocument();
  });

  describe("when the embedding is enabled", () => {
    let history: History;

    beforeEach(async () => {
      history = (
        await setupEmbedding({
          settingValues: { "enable-embedding": true },
        })
      ).history;
    });

    describe("static embedding", () => {
      it("should allow going to static embedding settings page", async () => {
        await goToStaticEmbeddingSettings();

        const location = history.getCurrentLocation();
        expect(location.pathname).toEqual(staticEmbeddingSettingsUrl);
      });

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
      });

      it("should allow access to the static embedding settings page", async () => {
        // Go to static embedding settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Static embedding",
            }),
          ).getByRole("button", { name: "Manage" }),
        );

        expect(screen.getByText("Embedding secret key")).toBeInTheDocument();
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive embedding settings page", async () => {
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

      it("should show info about interactive embedding", async () => {
        expect(screen.getByText("Interactive embedding")).toBeInTheDocument();
        expect(
          screen.getByText(/Embed dashboards, questions/),
        ).toBeInTheDocument();
      });
    });
  });

  describe("when the embedding SDK is enabled", () => {
    beforeEach(async () => {
      await setupEmbedding({
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

      it("should allow access to the embedding SDK settings page", async () => {
        // Go to embedding SDK settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Embedding SDK for React",
            }),
          ).getByRole("button", { name: "Try it out" }),
        );

        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeDisabled();
      });
    });
  });
});
