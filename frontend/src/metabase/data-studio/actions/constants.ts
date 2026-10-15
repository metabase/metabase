import type { EntityPickerOptions } from "metabase/common/components/Pickers";
import type { CollectionNamespace } from "metabase-types/api";

export const ACTION_NAME_MAX_LENGTH = 254;

export const ACTION_COLLECTION_PICKER_OPTIONS: EntityPickerOptions = {
  hasSearch: false,
  hasRecents: false,
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: false,
  hasConfirmButtons: true,
  canCreateCollections: true,
};

export const ACTION_COLLECTION_NAMESPACES: CollectionNamespace[] = [
  "data-actions",
];
