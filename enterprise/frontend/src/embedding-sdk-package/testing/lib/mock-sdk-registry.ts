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

export type MockSdkRegistry = {
  handlers: MockSdkHandlers;
  resets: Set<() => void>;
};

export function getMockSdkRegistry(): MockSdkRegistry {
  const registry = { handlers: {}, resets: new Set<() => void>() };
  const win = getWindow();

  if (!win) {
    return registry;
  }

  win.METABASE_EMBEDDING_SDK_MOCKS ??= registry;

  return win.METABASE_EMBEDDING_SDK_MOCKS;
}

export function resetMockSdkRegistry() {
  getMockSdkRegistry().resets.forEach((reset) => reset());
}
