import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Hook for interacting with Metabot.
 *
 * Provides methods to send messages, manage conversation state,
 * and read Metabot responses.
 *
 * Must be used within a `MetabaseProvider`.
 *
 * @function
 * @category useMetabot
 */
export const useMetabot = () => {
  const useMetabotHook = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.useMetabot;

  if (!useMetabotHook) {
    throw new Error(
      "useMetabot: SDK bundle is not loaded yet. Make sure to use this hook within a MetabaseProvider.",
    );
  }

  return useMetabotHook();
};
