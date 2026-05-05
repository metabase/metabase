import { t } from "ttag";

import {
  EntityPickerModal,
  type EntityPickerOptions,
} from "metabase/common/components/Pickers";

import {
  DOCUMENT_LINK_MODELS,
  ENTITY_PICKER_OPTIONS,
  RECENTS_CONTEXT,
} from "./constants";
import type { DocumentLinkedEntityPickerItemValue } from "./types";
import { getCanSelectItem } from "./utils";

interface LinkedEntityPickerModalProps {
  value?: DocumentLinkedEntityPickerItemValue | null;
  options?: EntityPickerOptions;
  onChange: (value: DocumentLinkedEntityPickerItemValue) => void;
  onConfirm?: () => void;
  onClose: () => void;
}

export function LinkedEntityPickerModal({
  value,
  options = {},
  onChange,
  onClose,
}: LinkedEntityPickerModalProps) {
  return (
    <EntityPickerModal
      title={t`Choose an item to link`}
      models={DOCUMENT_LINK_MODELS}
      value={value || undefined}
      options={{
        ...ENTITY_PICKER_OPTIONS,
        ...options,
      }}
      recentsContext={RECENTS_CONTEXT}
      isSelectableItem={getCanSelectItem}
      onChange={onChange}
      onClose={onClose}
    />
  );
}
