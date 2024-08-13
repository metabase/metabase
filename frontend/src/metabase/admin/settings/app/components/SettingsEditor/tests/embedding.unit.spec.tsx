import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEmbedding = async (opts?: SetupOpts) => {
  await setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({
      embedding: true,
    }),
    hasEnterprisePlugins: true,
  });
};

describe("SettingsEditor", () => {
  it("should allow to configure the origin and SameSite cookie setting for interactive embedding", async () => {
    await setupEmbedding({
      settings: [
        createMockSettingDefinition({ key: "enable-embedding" }),
        createMockSettingDefinition({ key: "embedding-app-origin" }),
        createMockSettingDefinition({ key: "session-cookie-samesite" }),
      ],
      settingValues: createMockSettings({
        "enable-embedding": true,
        "session-cookie-samesite": "lax",
      }),
    });

    await userEvent.click(screen.getByText("Embedding"));
    await goToInteractiveEmbeddingSettings();
    expect(screen.getByText("Interactive embedding")).toBeInTheDocument();

    expect(screen.getByText("Authorized origins")).toBeInTheDocument();
    expect(screen.getByText("SameSite cookie setting")).toBeInTheDocument();

    expect(
      screen.queryByText(/some of our paid plans/),
    ).not.toBeInTheDocument();
  });

  // eslint-disable-next-line jest/no-disabled-tests -- disabled until metabase#43523
  describe.skip("SameSite cookie note check with authorized origins", () => {
    it("should display a note if any authorized origins do not match the instance domain", async () => {
      await setupEmbedding({
        settings: [
          createMockSettingDefinition({ key: "enable-embedding" }),
          createMockSettingDefinition({ key: "embedding-app-origin" }),
          createMockSettingDefinition({ key: "session-cookie-samesite" }),
        ],
        settingValues: createMockSettings({
          "embedding-app-origin": "https://example.com",
          "enable-embedding": true,
          "session-cookie-samesite": "lax",
        }),
      });

      await userEvent.click(screen.getByText("Embedding"));
      await goToInteractiveEmbeddingSettings();

      expect(screen.getByTestId("authorized-origins-note")).toBeInTheDocument();
    });

    it("should not display a note if all authorized origins match the instance domain", async () => {
      await setupEmbedding({
        settings: [
          createMockSettingDefinition({ key: "enable-embedding" }),
          createMockSettingDefinition({ key: "embedding-app-origin" }),
          createMockSettingDefinition({ key: "session-cookie-samesite" }),
        ],
        settingValues: createMockSettings({
          "embedding-app-origin": "",
          "enable-embedding": true,
          "session-cookie-samesite": "lax",
        }),
      });

      await userEvent.click(screen.getByText("Embedding"));
      await goToInteractiveEmbeddingSettings();

      expect(
        screen.queryByTestId("authorized-origins-note"),
      ).not.toBeInTheDocument();
    });

    it("should not display a note if SameSite cookie is set to 'none'", async () => {
      await setupEmbedding({
        settings: [
          createMockSettingDefinition({ key: "enable-embedding" }),
          createMockSettingDefinition({ key: "embedding-app-origin" }),
          createMockSettingDefinition({ key: "session-cookie-samesite" }),
        ],
        settingValues: createMockSettings({
          "embedding-app-origin": "https://example.com",
          "enable-embedding": true,
          "session-cookie-samesite": "none",
        }),
      });

      await userEvent.click(screen.getByText("Embedding"));
      await goToInteractiveEmbeddingSettings();

      expect(
        screen.queryByTestId("authorized-origins-note"),
      ).not.toBeInTheDocument();
    });
  });
});

const goToInteractiveEmbeddingSettings = async () => {
  await userEvent.click(screen.getByText("Configure"));
};
