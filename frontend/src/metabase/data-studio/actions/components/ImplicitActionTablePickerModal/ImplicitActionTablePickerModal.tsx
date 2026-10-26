import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import {
  EntityPickerModal,
  type OmniPickerItem,
  type OmniPickerTableItem,
} from "metabase/common/components/Pickers";
import { hasActionsEnabled } from "metabase/common/utils/database";
import type { DatabaseId, TableId } from "metabase-types/api";

import { ACTION_TABLE_PICKER_OPTIONS } from "../../constants";

const isTableItem = (item: OmniPickerItem): item is OmniPickerTableItem =>
  item.model === "table" && "database_id" in item;

type ImplicitActionTablePickerModalProps = {
  tableId?: TableId;
  onChange: (table: OmniPickerTableItem) => void;
  onClose: () => void;
};

export function ImplicitActionTablePickerModal({
  tableId,
  onChange,
  onClose,
}: ImplicitActionTablePickerModalProps) {
  const { data } = useListDatabasesQuery();
  const enabledDatabaseIds = useMemo(
    () =>
      new Set<DatabaseId>(
        (data?.data ?? []).filter(hasActionsEnabled).map(({ id }) => id),
      ),
    [data],
  );

  const isHiddenItem = (item: OmniPickerItem) => {
    switch (item.model) {
      case "database":
        return !enabledDatabaseIds.has(item.id);
      case "schema":
      case "table":
        return (
          "database_id" in item &&
          item.database_id != null &&
          !enabledDatabaseIds.has(item.database_id)
        );
      default:
        return false;
    }
  };

  const handleChange = (item: OmniPickerItem) => {
    if (isTableItem(item)) {
      onChange(item);
    }
  };

  return (
    <EntityPickerModal
      title={t`Pick a table for the action`}
      models={["table"]}
      value={tableId != null ? { model: "table", id: tableId } : undefined}
      options={ACTION_TABLE_PICKER_OPTIONS}
      isHiddenItem={isHiddenItem}
      onChange={handleChange}
      onClose={onClose}
    />
  );
}
