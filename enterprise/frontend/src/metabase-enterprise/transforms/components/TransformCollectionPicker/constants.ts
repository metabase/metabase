import type { CollectionPickerOptions } from "metabase/common/components/Pickers/CollectionPicker";

export const TRANSFORM_COLLECTION_PICKER_OPTIONS: CollectionPickerOptions = {
  namespace: "transforms",
  showPersonalCollections: false,
  showRootCollection: true,
  showSearch: false,
  hasConfirmButtons: true,
  allowCreateNew: true,
  hasRecents: false,
  showLibrary: false,
};
