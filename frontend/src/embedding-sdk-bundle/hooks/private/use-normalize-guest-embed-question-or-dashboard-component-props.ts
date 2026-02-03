import type { StaticQuestionProps } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type { StaticDashboardProps } from "embedding-sdk-bundle/components/public/dashboard";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getHasTokenFeature } from "embedding-sdk-bundle/store/selectors";

export const useNormalizeGuestEmbedQuestionOrDashboardComponentProps = <
  TProps extends StaticDashboardProps | StaticQuestionProps,
>(
  props: TProps,
): TProps => {
  const hasTokenFeature = useSdkSelector(getHasTokenFeature);

  if (hasTokenFeature) {
    return props;
  }

  return {
    ...props,
    // For OSS usage we force downloads
    withDownloads: true,
  };
};
