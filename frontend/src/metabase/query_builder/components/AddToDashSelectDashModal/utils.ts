import type { OmniPickerItem } from "metabase/common/components/Pickers";
import type { CollectionId } from "metabase-types/api";

export const isInPersonalCollection = (
  dash: OmniPickerItem,
  personalCollectionId: CollectionId,
) => {
  if ("is_personal" in dash && dash.is_personal != null) {
    return dash.is_personal;
  }
  if ("location" in dash && !!dash.location) {
    return dash.location.split("/")[1] === String(personalCollectionId);
  }
  return false;
};
