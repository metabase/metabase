import type { RecentItem } from "metabase-types/api";
import { isSyncCompleted } from "metabase/lib/syncing";

export const getItemName = ({ model_object }: RecentItem) => {
  return model_object.display_name || model_object.name;
};

export const isItemActive = ({ model, model_object }: RecentItem) => {
  if (model !== "table") {
    return true;
  }
  return isSyncCompleted(model_object);
};
