import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, within } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { SettingKey, Settings } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { setup } from "../setup";

export type SetupOpts = {
  settingValues?: Partial<Settings>;
  isHosted?: boolean;
  hasEmbeddingFeature?: boolean;
  hasEnterprisePlugins?: boolean;
};

export const setupEmbedding = async ({
  settingValues,
  isHosted = false,
  hasEmbeddingFeature = false,
  hasEnterprisePlugins = false,
}: SetupOpts) => {
  const returnedValue = await setup({
    settings: Object.entries(settingValues ?? {}).map(([key, value]) => {
      return createMockSettingDefinition({
        key: key as SettingKey,
        value,
      });
    }),
    settingValues: createMockSettings(settingValues),
    tokenFeatures: createMockTokenFeatures({
      hosting: isHosted,
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

export const getInteractiveEmbeddingQuickStartLink = () => {
  return within(
    screen.getByRole("article", {
      name: "Interactive embedding",
    }),
  ).getByRole("link", { name: "Check out our Quick Start" });
};

export const embeddingSettingsUrl =
  "/admin/settings/embedding-in-other-applications";
export const staticEmbeddingSettingsUrl =
  "/admin/settings/embedding-in-other-applications/standalone";
export const interactiveEmbeddingSettingsUrl =
  "/admin/settings/embedding-in-other-applications/full-app";
