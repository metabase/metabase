import { useCallback } from "react";
import { t } from "ttag";

import { useCreateActionMutation } from "metabase/api";
import type { CardId } from "metabase-types/api";

const defaultImplicitActionCreateOptions = {
  insert: true,
  update: true,
  delete: true,
};

export function useEnableImplicitActionsForModel(modelId: CardId) {
  const [createAction] = useCreateActionMutation();
  return useCallback(
    async (options = defaultImplicitActionCreateOptions) => {
      // We're ordering actions that's most recently created first.
      // So if we want to show Create, Update, Delete, then we need
      // to create them in the reverse order.
      if (options.delete) {
        await createAction({
          name: t`Delete`,
          type: "implicit",
          kind: "row/delete",
          model_id: modelId,
        }).unwrap();
      }
      if (options.update) {
        await createAction({
          name: t`Update`,
          type: "implicit",
          kind: "row/update",
          model_id: modelId,
        }).unwrap();
      }
      if (options.insert) {
        await createAction({
          name: t`Create`,
          type: "implicit",
          kind: "row/create",
          model_id: modelId,
        }).unwrap();
      }
    },
    [createAction, modelId],
  );
}
