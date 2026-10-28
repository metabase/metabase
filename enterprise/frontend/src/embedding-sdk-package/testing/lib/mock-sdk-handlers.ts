import type { MetabaseEmbeddingSdkBundleExports } from "embedding-sdk-bundle/types/sdk-bundle";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type MockSdkHandlers = Partial<
  Pick<
    MetabaseEmbeddingSdkBundleExports,
    | "resolveDatasetQuery"
    | "queryDataset"
    | "queryQuestion"
    | "createDashboard"
    | "executeAction"
  >
>;

export const getMockSdkHandlers = (): MockSdkHandlers => {
  const win = getWindow();

  if (!win) {
    return {};
  }

  win.METABASE_EMBEDDING_SDK_MOCK_HANDLERS ??= {};

  return win.METABASE_EMBEDDING_SDK_MOCK_HANDLERS;
};

export const clearMockSdkHandlers = () => {
  delete getWindow()?.METABASE_EMBEDDING_SDK_MOCK_HANDLERS;
};
