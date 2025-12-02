import type { ComponentProviderProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { getHasTokenFeature } from "embedding-sdk-bundle/store/selectors";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";

export const useNormalizeComponentProviderProps = (
  props: Omit<ComponentProviderProps, "children">,
): Omit<ComponentProviderProps, "children"> => {
  const hasTokenFeature = useLazySelector(getHasTokenFeature);
  const normalizedProps = { ...props };

  // For OSS usage we prevent defining a locale or theme
  if (!hasTokenFeature) {
    delete normalizedProps.locale;
    delete normalizedProps.theme;
  }

  return normalizedProps;
};
