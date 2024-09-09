import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Settings } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { setup } from "../setup";

export type SetupOpts = {
  settingValues?: Partial<Settings>;
  hasEmbeddingFeature?: boolean;
  hasEnterprisePlugins?: boolean;
};

export const setupEmbedding = async ({
  settingValues,
  hasEmbeddingFeature = false,
  hasEnterprisePlugins = false,
}: SetupOpts) => {
  const returnedValue = await setup({
    settings: [createMockSettingDefinition({ key: "enable-embedding" })],
    settingValues: createMockSettings(settingValues),
    tokenFeatures: createMockTokenFeatures({
      embedding: hasEmbeddingFeature,
      embedding_sdk: hasEmbeddingFeature,
    }),
    hasEnterprisePlugins,
  });

  fetchMock.get("path:/api/dashboard/embeddable", []);
  fetchMock.get("path:/api/card/embeddable", []);

  await userEvent.click(screen.getByText("Embedding"));

  return { ...returnedValue, history: checkNotNull(returnedValue.history) };
};

export const goToStaticEmbeddingSettings = async () => {
  await userEvent.click(screen.getByText("Manage"));
};

export const goToInteractiveEmbeddingSettings = async () => {
  await userEvent.click(
    within(
      screen.getByRole("article", {
        name: "Interactive embedding",
      }),
    ).getByRole("button", { name: "Configure" }),
  );
};

export const getQuickStartLink = () => {
  return screen.getByRole("link", { name: "Check out our Quick Start" });
};

export const embeddingSettingsUrl =
  "/admin/settings/embedding-in-other-applications";
export const staticEmbeddingSettingsUrl =
  "/admin/settings/embedding-in-other-applications/standalone";
export const interactiveEmbeddingSettingsUrl =
  "/admin/settings/embedding-in-other-applications/full-app";
