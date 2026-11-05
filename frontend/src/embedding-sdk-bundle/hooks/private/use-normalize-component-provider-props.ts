import type { ComponentProviderInternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getHasTokenFeature } from "embedding-sdk-bundle/store/selectors";
import { isEmbeddingMcpApp } from "metabase/embedding-sdk/config";

export const useNormalizeComponentProviderProps = (
  props: ComponentProviderInternalProps,
): ComponentProviderInternalProps => {
  const hasTokenFeature = useSdkSelector(getHasTokenFeature);
  const normalizedProps = { ...props };

  // MCP Apps in OSS must apply the theme variables from MCP hosts.
  if (!hasTokenFeature && !isEmbeddingMcpApp()) {
    // We prevent defining a locale
    delete normalizedProps.locale;

    // We allow only defining a theme preset
    if (normalizedProps.theme) {
      const { theme } = normalizedProps;
      normalizedProps.theme = "preset" in theme ? { preset: theme.preset } : {};
    }
  }

  return normalizedProps;
};
