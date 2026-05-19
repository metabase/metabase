import { useCallback } from "react";
import { t } from "ttag";

import { useCreateActionMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks/use-toast";
import type { CardId } from "metabase-types/api";

export function useEnableImplicitActionsForModel(modelId: CardId) {
  const [createAction] = useCreateActionMutation();
  const [sendToast] = useToast();
  return useCallback(async () => {
    try {
      // We're ordering actions that's most recently created first.
      // So if we want to show Create, Update, Delete, then we need
      // to create them in the reverse order.
      await createAction({
        name: t`Delete`,
        type: "implicit",
        kind: "row/delete",
        model_id: modelId,
      }).unwrap();
      await createAction({
        name: t`Update`,
        type: "implicit",
        kind: "row/update",
        model_id: modelId,
      }).unwrap();
      await createAction({
        name: t`Create`,
        type: "implicit",
        kind: "row/create",
        model_id: modelId,
      }).unwrap();
    } catch (_error) {
      sendToast({
        icon: "warning",
        message: t`Failed to create basic actions`,
      });
    }
  }, [createAction, modelId, sendToast]);
}
