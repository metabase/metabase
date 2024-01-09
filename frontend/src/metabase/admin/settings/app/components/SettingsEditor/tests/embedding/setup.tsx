import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { Settings } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/lib/types";
import { screen } from "__support__/ui";
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
    settingValues: createMockSettings(settingValues),
    tokenFeatures: createMockTokenFeatures({
      embedding: hasEmbeddingFeature,
    }),
    hasEnterprisePlugins,
  });

  fetchMock.get("path:/api/dashboard/embeddable", []);
  fetchMock.get("path:/api/card/embeddable", []);

  userEvent.click(screen.getByText("Embedding"));

  return { ...returnedValue, history: checkNotNull(returnedValue.history) };
};

export const goToStaticEmbeddingSettings = () => {
  userEvent.click(screen.getByText("Manage"));
};

export const goToInteractiveEmbeddingSettings = () => {
  userEvent.click(screen.getByText("Configure"));
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
