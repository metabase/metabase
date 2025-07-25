import { useMemo } from "react";
import { t } from "ttag";

type UseEditTableLoadingOverlayProps = {
  isDatasetLoading: boolean;
  isDatasetFetching: boolean;
  isUndoLoading: boolean;
  isRedoLoading: boolean;
};

export function useEditTableLoadingOverlay({
  isDatasetLoading,
  isDatasetFetching,
  isUndoLoading,
  isRedoLoading,
}: UseEditTableLoadingOverlayProps) {
  return useMemo(() => {
    if (isUndoLoading) {
      return {
        show: true,
        message: t`Undoing changes...`,
      };
    }

    if (isRedoLoading) {
      return {
        show: true,
        message: t`Redoing changes...`,
      };
    }

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
  }, [isDatasetLoading, isDatasetFetching, isUndoLoading, isRedoLoading]);
}
