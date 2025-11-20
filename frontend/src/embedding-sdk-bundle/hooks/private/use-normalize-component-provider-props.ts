import type { ComponentProviderProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";

export const useNormalizeComponentProviderProps = (
  props: Omit<ComponentProviderProps, "children">,
): Omit<ComponentProviderProps, "children"> => {
  const isEmbeddingSdkFeatureEnabled = PLUGIN_EMBEDDING_SDK.isEnabled();
  const normalizedProps = { ...props };

  // For OSS usage we prevent defining a locale or theme
  if (!isEmbeddingSdkFeatureEnabled) {
    delete props.locale;
    delete props.theme;
  }

  return normalizedProps;
};
