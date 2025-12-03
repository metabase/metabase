import type { ComponentProviderInternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getHasTokenFeature } from "embedding-sdk-bundle/store/selectors";

export const useNormalizeComponentProviderProps = (
  props: ComponentProviderInternalProps,
): ComponentProviderInternalProps => {
  const hasTokenFeature = useSdkSelector(getHasTokenFeature);
  const normalizedProps = { ...props };

  // For OSS usage we prevent defining a locale or theme
  if (!hasTokenFeature) {
    delete normalizedProps.locale;
    delete normalizedProps.theme;
  }

  return normalizedProps;
};
