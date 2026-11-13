import { t } from "ttag";

import { useToast } from "metabase/common/hooks";

import { trackHealthChecksRefreshClicked } from "../../analytics";
import {
  useListHealthChecksQuery,
  useRecheckHealthChecksMutation,
} from "../../api";

export const useHealthChecks = () => {
  const { data, isLoading, error } = useListHealthChecksQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [recheckAllMutation, { isLoading: isRecheckingAll }] =
    useRecheckHealthChecksMutation();
  const [sendToast] = useToast();

  const recheckAll = async () => {
    trackHealthChecksRefreshClicked();
    const { error: recheckError } = await recheckAllMutation();
    if (recheckError) {
      sendToast({
        variant: "negative",
        message: t`Failed to refresh health checks. Please try again.`,
      });
    }
  };

  return {
    checks: data?.checks ?? [],
    isLoading,
    error,
    recheckAll,
    isRecheckingAll,
  };
};
