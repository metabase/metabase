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
        show: true,
        message: t`Loading data...`,
      };
    }

    if (isDatasetFetching) {
      return {
        show: true,
        message: t`Updating...`,
      };
    }

    return {
      show: false,
    };
  }, [isDatasetLoading, isDatasetFetching]);
}
