import * as MetabaseEmbeddingSDK from "embedding-sdk/bundle";

// Put SDK to the global object, so it can be used in tests/storybook
export function defineGlobalEmbeddingSdk() {
  if (typeof window !== "undefined") {
    if (!window.MetabaseEmbeddingSDK) {
      window.MetabaseEmbeddingSDK = MetabaseEmbeddingSDK;
    }
  }
}
