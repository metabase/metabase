import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { isResourceNotFoundError } from "metabase/utils/errors";
import type { HealthCheckId } from "metabase-types/api";

import { trackHealthCheckRecheckClicked } from "../../analytics";
import {
  useListHealthChecksQuery,
  useRecheckHealthCheckMutation,
  useRecheckHealthChecksMutation,
} from "../../api";

const RECHECK_ALL_CACHE_KEY = "security-center-recheck-all";

const useRecheckErrorToast = () => {
  const [sendToast] = useToast();

  return () =>
    sendToast({
      variant: "negative",
      message: t`Failed to re-check. Please try again.`,
    });
};

export const useHealthChecks = () => {
  const { data, isLoading, isError } = useListHealthChecksQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [recheckAllMutation, { isLoading: isRecheckingAll }] =
    useRecheckHealthChecksMutation({ fixedCacheKey: RECHECK_ALL_CACHE_KEY });
  const showRecheckError = useRecheckErrorToast();

  const recheckAll = async () => {
    trackHealthCheckRecheckClicked("all");
    const { error } = await recheckAllMutation();
    if (error) {
      showRecheckError();
    }
  };

  return {
    checks: data?.checks ?? [],
    isLoading,
    isError,
    recheckAll,
    isRecheckingAll,
  };
};

export const useHealthCheckRecheck = (checkId: HealthCheckId) => {
  const [recheckMutation, { isLoading: isRechecking }] =
    useRecheckHealthCheckMutation();
  const [, { isLoading: isRecheckingAll }] = useRecheckHealthChecksMutation({
    fixedCacheKey: RECHECK_ALL_CACHE_KEY,
  });
  const showRecheckError = useRecheckErrorToast();

  const recheck = async () => {
    trackHealthCheckRecheckClicked(checkId);
    const { error } = await recheckMutation(checkId);
    if (error && !isResourceNotFoundError(error)) {
      showRecheckError();
    }
  };

  return { recheck, isRechecking, isRecheckingAll };
};
