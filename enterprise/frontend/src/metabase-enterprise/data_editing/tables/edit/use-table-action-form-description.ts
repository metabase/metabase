import { useEffect } from "react";

import { useDescribeActionFormMutation } from "metabase-enterprise/api";

import type { BuiltInTableAction, TableEditingScope } from "../types";

type UseTableDescribeTmpModalProps = {
  actionId: BuiltInTableAction;
  scope: TableEditingScope;
  skip?: boolean;
};

export const useActionFormDescription = ({
  actionId,
  scope,
  skip,
}: UseTableDescribeTmpModalProps) => {
  const [fetchModalDescription, { data, isLoading }] =
    useDescribeActionFormMutation();

  useEffect(() => {
    if (!data && !skip) {
      fetchModalDescription({
        action_id: actionId,
        scope,
      });
    }
  }, [fetchModalDescription, actionId, scope, data, skip]);

  return {
    data,
    isLoading,
  };
};
