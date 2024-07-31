import { useCallback } from "react";

import { useLogRecentItemMutation } from "metabase/api";
import { isLoggableActivityModel } from "metabase-types/api";

import type { CollectionPickerItem } from "../../CollectionPicker";
import type { NotebookDataPickerValueItem } from "../../DataPicker";

export const useLogRecentItem = () => {
  const [logRecentItem] = useLogRecentItemMutation();

  const tryLogRecentItem = useCallback(
    (item: CollectionPickerItem | NotebookDataPickerValueItem) => {
      if (isLoggableActivityModel(item)) {
        logRecentItem({
          model_id: item.id,
          model: item.model,
        });
      }
    },
    [logRecentItem],
  );

  return {
    tryLogRecentItem,
  };
};
