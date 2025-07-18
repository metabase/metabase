import { useMemo } from "react";
import { t } from "ttag";

type UseEditTableLoadingOverlayProps = {
  isDatasetLoading: boolean;
  isDatasetFetching: boolean;
};

export function useEditTableLoadingOverlay({
  isDatasetLoading,
  isDatasetFetching,
}: UseEditTableLoadingOverlayProps) {
  return useMemo(() => {
    if (isDatasetLoading) {
      return {
        enabled: true,
        message: t`Loading data...`,
      };
    }

    if (isDatasetFetching) {
      return {
        enabled: true,
        message: t`Updating...`,
      };
    }

    return {
      enabled: false,
    };
  }, [isDatasetLoading, isDatasetFetching]);
}
