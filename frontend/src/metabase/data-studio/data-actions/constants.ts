import type { EntityPickerOptions } from "metabase/common/components/Pickers";

export const ACTION_NAME_MAX_LENGTH = 254;

export const ACTION_COLLECTION_PICKER_OPTIONS: EntityPickerOptions = {
  hasSearch: true,
  hasRecents: false,
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: true,
  hasConfirmButtons: true,
  canCreateCollections: true,
};
