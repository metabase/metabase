import { useCallback, useMemo } from "react";

import { useSetting } from "metabase/common/hooks";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { DatabaseId, RecentContexts, TableId } from "metabase-types/api";

import type {
  EntityPickerOptions,
  OmniPickerItem,
  OmniPickerValue,
} from "../EntityPicker";
import { EntityPickerModal } from "../EntityPicker";

import type { DataPickerValue } from "./types";
import { isDataPickerValue } from "./types";
import { shouldDisableItemNotInDb } from "./utils";

interface Props {
  title: string;
  value?: OmniPickerValue;
  models?: DataPickerValue["model"][];
  onChange: (value: TableId) => void;
  onClose: () => void;
  onlyDatabaseId?: DatabaseId;
  shouldDisableItem?: (item: OmniPickerItem) => boolean;
  options?: EntityPickerOptions;
}

const DATA_PICKER_MODELS: DataPickerValue["model"][] = [
  "card",
  "dataset",
  "metric",
  "table",
];

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

export const DataPickerModal = ({
  title,
  value,
  onChange,
  onClose,
  onlyDatabaseId,
  shouldDisableItem,
  options: passedOptions,
  models: passedModels = DATA_PICKER_MODELS,
}: Props) => {
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");

  const models: DataPickerValue["model"][] = useMemo(
    () => (hasNestedQueriesEnabled ? passedModels : ["table"]),
    [hasNestedQueriesEnabled, passedModels],
  );

  const searchParams = useMemo(() => {
    const tableParams = onlyDatabaseId
      ? { table_db_id: onlyDatabaseId }
      : undefined;
    return {
      include_dashboard_questions: true,
      ...tableParams,
    };
  }, [onlyDatabaseId]);

  const shouldDisable = useMemo(() => {
    const shouldDisableFn = shouldDisableItemNotInDb(onlyDatabaseId);

    return (i: OmniPickerItem) =>
      shouldDisableFn(i) || Boolean(shouldDisableItem && shouldDisableItem(i));
  }, [onlyDatabaseId, shouldDisableItem]);

  const handleItemSelect = useCallback(
    (item: OmniPickerItem) => {
      if (!isDataPickerValue(item)) {
        return;
      }

      const id =
        item.model === "table" ? item.id : getQuestionVirtualTableId(item.id);
      onChange(id);
      onClose();
    },
    [onChange, onClose],
  );

  return (
    <EntityPickerModal
      models={models}
      value={value}
      options={{
        hasSearch: true,
        hasRecents: true,
        hasLibrary: true,
        hasDatabases: true,
        hasRootCollection: true,
        hasConfirmButtons: false,
        hasPersonalCollections: true,
        ...passedOptions,
      }}
      recentsContext={RECENTS_CONTEXT}
      searchParams={searchParams}
      title={title}
      onClose={onClose}
      onChange={handleItemSelect}
      isDisabledItem={shouldDisable}
    />
  );
};
