import { useMemo } from "react";
import { t } from "ttag";

import {
  EntityPickerModal,
  type EntityPickerProps,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import {
  ENTITY_PICKER_OPTIONS,
  ENTRY_PICKER_MODELS,
  RECENTS_CONTEXT,
} from "./constants";
import { getEntryPickerItem, getEntryPickerValue } from "./utils";

type EntryPickerModalProps = {
  value: DependencyNode | null;
  models?: EntityPickerProps["models"];
  onChange: (value: DependencyEntry) => void;
  onClose: () => void;
};
export function EntryPickerModal({
  value,
  models = ENTRY_PICKER_MODELS,
  onChange,
  onClose,
}: EntryPickerModalProps) {
  const selectedItem = useMemo(() => {
    return value != null ? getEntryPickerItem(value) : undefined;
  }, [value]);

  const handleItemSelect = (item: OmniPickerItem) => {
    const value = getEntryPickerValue(item);
    if (value != null) {
      onChange(value);
    }
  };

  return (
    <EntityPickerModal
      title={t`Pick an item to see its dependencies`}
      models={models}
      value={selectedItem}
      options={ENTITY_PICKER_OPTIONS}
      recentsContext={RECENTS_CONTEXT}
      onChange={handleItemSelect}
      onClose={onClose}
    />
  );
}
