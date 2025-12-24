import { useCallback, useState } from "react";

import type { DependencyEntry } from "metabase-types/api";

import { UnifiedDataPickerModal } from "./UnifiedDataPickerModal";

interface EntryPickerModalWithConfirmProps {
  onConfirm: (value: DependencyEntry) => void;
  onClose: () => void;
}

const EXTRA_OPTIONS = {
  hasConfirmButtons: true,
};

export const UnifiedDataPickerModalWithConfirm = ({
  onConfirm,
  onClose,
}: EntryPickerModalWithConfirmProps) => {
  const [value, setValue] = useState<DependencyEntry | null>(null);

  const handleChange = useCallback((value: DependencyEntry) => {
    setValue(value);
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(value);
    onClose();
  }, [onClose, onConfirm, value]);

  return (
    <UnifiedDataPickerModal
      value={value}
      options={EXTRA_OPTIONS}
      onChange={handleChange}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
};
