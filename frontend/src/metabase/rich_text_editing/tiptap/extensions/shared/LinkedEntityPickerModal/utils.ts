import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  PERSONAL_COLLECTIONS,
  ROOT_COLLECTION,
} from "metabase/entities/collections";

import { DOCUMENT_LINK_MODELS } from "./constants";
import type { DocumentLinkedEntityPickerItemValue } from "./types";

export const getCanSelectItem = (
  item: OmniPickerItem | null,
): item is DocumentLinkedEntityPickerItemValue => {
  if (item && DOCUMENT_LINK_MODELS.includes(item.model)) {
    if (
      item.model === "collection" &&
      (!item.id ||
        item.id === PERSONAL_COLLECTIONS.id ||
        item.id === ROOT_COLLECTION.id)
    ) {
      return false;
    }

    return true;
  }

  return false;
};
