import type { EntityPickerOptions } from "metabase/common/components/Pickers";

/** Limits a collection picker to the Library */
export const LIBRARY_COLLECTION_PICKER_OPTIONS: EntityPickerOptions = {
  hasLibrary: true,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: false,
};
