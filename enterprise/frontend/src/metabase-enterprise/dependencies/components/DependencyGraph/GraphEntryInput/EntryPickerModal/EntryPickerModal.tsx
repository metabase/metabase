import { useMemo } from "react";
import { t } from "ttag";

import {
  type EntityPickerCustomFolder,
  EntityPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { useDataApps } from "metabase-enterprise/dependencies/hooks/use-data-apps";
import type { DependencyEntry, DependencyNode } from "metabase-types/api";

import { getNodeIconWithType } from "../../../../utils";

import {
  ENTITY_PICKER_OPTIONS,
  ENTRY_PICKER_MODELS,
  RECENTS_CONTEXT,
} from "./constants";
import { getEntryPickerItem, getEntryPickerValue } from "./utils";

type EntryPickerModalProps = {
  value: DependencyNode | null;
  onChange: (value: DependencyEntry) => void;
  onClose: () => void;
};
export function EntryPickerModal({
  value,
  onChange,
  onClose,
}: EntryPickerModalProps) {
  const selectedItem = useMemo(() => {
    return value != null ? getEntryPickerItem(value) : undefined;
  }, [value]);

  const { data: dataApps = [], isLoading: isLoadingDataApps } = useDataApps();

  // data apps aren't collection items, so the picker can't list them itself
  const customFolders = useMemo(
    (): EntityPickerCustomFolder[] =>
      dataApps.length > 0
        ? [
            {
              id: "data-apps",
              name: t`Data apps`,
              items: dataApps.map((dataApp) => ({
                id: dataApp.id,
                name: dataApp.display_name,
                icon: getNodeIconWithType("data-app"),
                isSelected:
                  value?.type === "data-app" && value.id === dataApp.id,
                onSelect: () => onChange({ id: dataApp.id, type: "data-app" }),
              })),
            },
          ]
        : [],
    [dataApps, value, onChange],
  );

  const handleItemSelect = (item: OmniPickerItem) => {
    const value = getEntryPickerValue(item);
    if (value != null) {
      onChange(value);
    }
  };

  return (
    <EntityPickerModal
      title={t`Pick an item to see its dependencies`}
      models={ENTRY_PICKER_MODELS}
      customFolders={customFolders}
      isLoadingCustomFolders={isLoadingDataApps}
      value={selectedItem}
      options={ENTITY_PICKER_OPTIONS}
      recentsContext={RECENTS_CONTEXT}
      onChange={handleItemSelect}
      onClose={onClose}
    />
  );
}
