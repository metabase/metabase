import type { TypeWithModel } from "metabase/common/components/EntityPicker";
import {
  PERSONAL_COLLECTIONS,
  ROOT_COLLECTION,
} from "metabase/entities/collections";
import type { SearchModel, SearchResponse } from "metabase-types/api";

import { DOCUMENT_LINK_MODELS, type DocumentLinkItemModel } from "./constants";
import type { DocumentLinkedEntityPickerItemValue } from "./types";

export function hasAvailableModels(
  response: SearchResponse | undefined,
  models: SearchModel[],
) {
  const availableModels = response?.available_models ?? [];
  return models.some((model) => availableModels.includes(model));
}

export const getCanSelectItem = (
  item: TypeWithModel<string | number, string> | null,
): item is DocumentLinkedEntityPickerItemValue => {
  if (
    item &&
    DOCUMENT_LINK_MODELS.includes(item.model as DocumentLinkItemModel)
  ) {
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
