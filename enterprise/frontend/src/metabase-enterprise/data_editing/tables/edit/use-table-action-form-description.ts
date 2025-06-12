import { useEffect, useState } from "react";

import { useDescribeActionFormMutation } from "metabase-enterprise/api";

import type { BuiltInTableAction, TableEditingScope } from "../types";

type UseTableDescribeTmpModalProps = {
  actionId: BuiltInTableAction;
  scope: TableEditingScope;
  skip?: boolean;
  refetchDependencies?: unknown[];
};

export const useActionFormDescription = ({
  actionId,
  scope,
  skip,
  refetchDependencies = [],
}: UseTableDescribeTmpModalProps) => {
  const [shouldFetch, setShouldFetch] = useState(!skip);
  const [fetchModalDescription, { data, isLoading }] =
    useDescribeActionFormMutation();

  // Request re-fetch when `refetchDependencies` or `skip` changes
  useEffect(() => {
    if (!skip) {
      setShouldFetch(true);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, ...refetchDependencies]);

  // Fetch modal description when `shouldFetch` is true and not currently loading
  useEffect(() => {
    if (shouldFetch && !isLoading) {
      fetchModalDescription({
        action_id: actionId,
        scope,
      }).then(() => {
        setShouldFetch(false);
      });
    }
  }, [fetchModalDescription, shouldFetch, isLoading, actionId, scope]);

  return {
    data,
    isLoading,
  };
};
