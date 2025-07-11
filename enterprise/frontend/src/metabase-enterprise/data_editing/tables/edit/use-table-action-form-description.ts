import { useCallback, useEffect } from "react";

import { useDescribeActionFormMutation } from "metabase-enterprise/api";
import type { ActionScope } from "metabase-types/api";

import type { BuiltInTableAction } from "../types";

type UseTableDescribeTmpModalProps = {
  actionId: BuiltInTableAction;
  scope: ActionScope;
  fetchOnMount?: boolean;
};

export const useActionFormDescription = ({
  actionId,
  scope,
  fetchOnMount = true,
}: UseTableDescribeTmpModalProps) => {
  const [fetchModalDescription, { data, isLoading }] =
    useDescribeActionFormMutation();

  const refetch = useCallback(() => {
    fetchModalDescription({
      action_id: actionId,
      scope,
    });
  }, [actionId, scope, fetchModalDescription]);

  useEffect(() => {
    if (fetchOnMount) {
      refetch();
    }
  }, [fetchOnMount, refetch]);

  return {
    refetch,
    data,
    isLoading,
  };
};
