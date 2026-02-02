import { useCallback } from "react";

import { useLogRecentItemMutation } from "metabase/api";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { isLoggableActivityModel } from "metabase-types/api";

export const useLogRecentItem = () => {
  const [logRecentItem] = useLogRecentItemMutation();

  const tryLogRecentItem = useCallback(
    (item: OmniPickerItem) => {
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
