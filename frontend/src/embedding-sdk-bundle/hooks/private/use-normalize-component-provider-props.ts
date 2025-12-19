import _ from "underscore";

import type { ComponentProviderInternalProps } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getHasTokenFeature } from "embedding-sdk-bundle/store/selectors";

export const useNormalizeComponentProviderProps = (
  props: ComponentProviderInternalProps,
): ComponentProviderInternalProps => {
  const hasTokenFeature = useSdkSelector(getHasTokenFeature);
  const normalizedProps = { ...props };

  if (!hasTokenFeature) {
    // We prevent defining a locale
    delete normalizedProps.locale;

    // We allow only defining a theme preset
    if (normalizedProps.theme) {
      normalizedProps.theme = _.pick(normalizedProps.theme, "preset");
    }
  }

  return normalizedProps;
};
