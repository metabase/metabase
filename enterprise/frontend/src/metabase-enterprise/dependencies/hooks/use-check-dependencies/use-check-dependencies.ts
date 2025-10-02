import { useCallback, useState } from "react";

import type { UseCheckDependenciesResult } from "metabase/plugins";
import type { CheckDependenciesResponse } from "metabase-types/api";

type UseCheckDependenciesQueryData = {
  data?: CheckDependenciesResponse;
  error?: unknown;
  isLoading: boolean;
};

type UseCheckDependenciesArgsData<TRequest> = {
  lastArg?: TRequest;
};

type UseCheckDependenciesQueryResult<TRequest> = [
  (request: TRequest) => Promise<UseCheckDependenciesQueryData>,
  UseCheckDependenciesQueryData,
  UseCheckDependenciesArgsData<TRequest>,
];

type UseCheckDependenciesProps<TChange, TRequest> = {
  getCheckDependenciesRequest: (change: TChange) => TRequest;
  useLazyCheckDependenciesQuery: () => UseCheckDependenciesQueryResult<TRequest>;
  onSave: (change: TChange) => Promise<void>;
  onError: (error: unknown) => void;
};

export function useCheckDependencies<TChange, TRequest>({
  getCheckDependenciesRequest,
  useLazyCheckDependenciesQuery,
  onSave,
  onError,
}: UseCheckDependenciesProps<
  TChange,
  TRequest
>): UseCheckDependenciesResult<TChange> {
  const [change, setChange] = useState<TChange | null>(null);
  const [isConfirmationShown, setIsConfirmationShown] = useState(false);
  const [checkDependencies, { data, isLoading }] =
    useLazyCheckDependenciesQuery();

  const handleInitialSave = useCallback(
    async (change: TChange) => {
      const { data, error } = await checkDependencies(
        getCheckDependenciesRequest(change),
      );
      if (error != null) {
        onError(error);
      } else if (data != null && !data.success) {
        setChange(change);
        setIsConfirmationShown(true);
      } else {
        await onSave(change);
      }
    },
    [getCheckDependenciesRequest, checkDependencies, onSave, onError],
  );

  const handleCloseConfirmation = useCallback(() => {
    setChange(null);
    setIsConfirmationShown(false);
  }, []);

  const handleSaveAfterConfirmation = useCallback(async () => {
    if (change != null) {
      await onSave(change);
      handleCloseConfirmation();
    }
  }, [change, onSave, handleCloseConfirmation]);

  return {
    checkData: data,
    isCheckingDependencies: isLoading,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  };
}
