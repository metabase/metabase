import { useCallback, useState } from "react";

import { LinkedEntityPickerModal } from "./LinkedEntityPickerModal";
import type {
  DocumentLinkedEntityPickerItem,
  DocumentLinkedEntityPickerItemValue,
} from "./types";
import { getCanSelectItem } from "./utils";

interface LinkedEntityPickerModalWithConfirmProps {
  onConfirm: (value: DocumentLinkedEntityPickerItemValue) => void;
  onClose: () => void;
}

const EXTRA_OPTIONS = {
  hasConfirmButtons: true,
};

export const LinkedEntityPickerModalWithConfirm = ({
  onConfirm,
  onClose,
}: LinkedEntityPickerModalWithConfirmProps) => {
  const [value, setValue] = useState<DocumentLinkedEntityPickerItem | null>(
    null,
  );

  const handleChange = useCallback((value: DocumentLinkedEntityPickerItem) => {
    setValue(value);
  }, []);

  const handleConfirm = useCallback(() => {
    if (value && getCanSelectItem(value)) {
      onConfirm(value);
    }
    onClose();
  }, [onClose, onConfirm, value]);

  return (
    <LinkedEntityPickerModal
      value={value}
      options={EXTRA_OPTIONS}
      onChange={handleChange}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};
