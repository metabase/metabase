import type { EntityPickerOptions } from "metabase/common/components/Pickers";
import { setOpenModalWithProps } from "metabase/redux/ui";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

type NewCollectionModalOptions = {
  initialCollectionId: CollectionId | null;
  namespaces: CollectionNamespace[];
  pickerOptions: EntityPickerOptions;
};

/** The action that opens the New collection modal without the official-collection picker. */
export const openNewCollectionModal = ({
  initialCollectionId,
  namespaces,
  pickerOptions,
}: NewCollectionModalOptions) =>
  setOpenModalWithProps({
    id: "collection",
    props: {
      initialCollectionId,
      namespaces,
      pickerOptions,
      showAuthorityLevelPicker: false,
    },
  });
