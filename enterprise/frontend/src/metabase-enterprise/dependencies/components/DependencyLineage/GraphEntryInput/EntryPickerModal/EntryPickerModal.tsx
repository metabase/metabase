import { useMemo, useState } from "react";
import { t } from "ttag";

import { useLogRecentItemMutation } from "metabase/api";
import {
  EntityPickerModal,
  type EntityPickerTab,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import {
  TablePicker,
  type TablePickerStatePath,
} from "metabase/common/components/Pickers/TablePicker/TablePicker";
import {
  type DependencyEntry,
  type DependencyNode,
  type RecentContexts,
  isActivityModel,
} from "metabase-types/api";

import type { EntryPickerItem, EntryPickerModalOptions } from "./types";
import {
  filterRecents,
  getEntryPickerItem,
  getEntryPickerValue,
  getTablePickerValue,
} from "./utils";

type EntryPickerModalProps = {
  value: DependencyNode | undefined;
  onChange: (value: DependencyEntry) => void;
  onClose: () => void;
};

const OPTIONS: EntryPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
  hasRecents: true,
};

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

export function EntryPickerModal({
  value,
  onChange,
  onClose,
}: EntryPickerModalProps) {
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();
  const [logRecentItem] = useLogRecentItemMutation();

  const selectedItem = useMemo(() => {
    return value != null ? getEntryPickerItem(value) : undefined;
  }, [value]);

  const tabs = useMemo(() => {
    const computedTabs: EntityPickerTab<
      EntryPickerItem["id"],
      EntryPickerItem["model"],
      EntryPickerItem
    >[] = [];

    computedTabs.push({
      id: "tables-tab",
      displayName: t`Tables`,
      models: ["table"],
      folderModels: ["database", "schema"],
      icon: "table",
      render: ({ onItemSelect }) => (
        <TablePicker
          value={value != null ? getTablePickerValue(value) : undefined}
          path={tablesPath}
          onItemSelect={onItemSelect}
          onPathChange={setTablesPath}
        />
      ),
    });

    return computedTabs;
  }, [value, tablesPath]);

  const handleItemSelect = (item: EntryPickerItem) => {
    const value = getEntryPickerValue(item);
    if (value != null) {
      if (isActivityModel(item.model)) {
        logRecentItem({ model: item.model, model_id: value.id });
      }

      onChange(value);
    }
  };

  return (
    <EntityPickerModal
      title={t`Pick your starting data`}
      tabs={tabs}
      initialValue={selectedItem}
      selectedItem={selectedItem ?? null}
      options={OPTIONS}
      recentFilter={filterRecents}
      recentsContext={RECENTS_CONTEXT}
      canSelectItem
      defaultToRecentTab={false}
      onItemSelect={handleItemSelect}
      onClose={onClose}
    />
  );
}
