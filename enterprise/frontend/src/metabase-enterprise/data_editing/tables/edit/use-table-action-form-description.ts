import { useEffect } from "react";

import { useDescribeActionFormMutation } from "metabase-enterprise/api";

import type { BuiltInTableAction, TableEditingScope } from "../types";

type UseTableDescribeTmpModalProps = {
  actionId: BuiltInTableAction;
  scope: TableEditingScope;
};

export const useActionFormDescription = ({
  actionId,
  scope,
}: UseTableDescribeTmpModalProps) => {
  const [fetchModalDescription, { data, isLoading }] =
    useDescribeActionFormMutation();

  useEffect(() => {
    if (!data) {
      fetchModalDescription({
        action_id: actionId,
        scope,
      });
    }
  }, [fetchModalDescription, actionId, scope, data]);

  return {
    data,
    isLoading,
  };
};
