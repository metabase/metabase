import { useCallback, useMemo } from "react";
import { t } from "ttag";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  DatabaseId,
  RecentItem,
  TableId,
} from "metabase-types/api";
import type { EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import type { QuestionPickerItem } from "../../QuestionPicker";
import type {
  DataPickerModalOptions,
  DataPickerValue,
  NotebookDataPickerValueItem,
} from "../types";
import {
  isValidValueItem,
} from "../utils";
import { TablePicker } from "./TablePicker";
import { useListDatabasesQuery } from "metabase/api";

interface Props {
  /**
   * Limit selection to a particular database
   */
  databaseId?: DatabaseId;
  title: string;
  value: DataPickerValue | undefined;
  models?: DataPickerValue["model"][];
  onChange: (value: TableId) => void;
  onClose: () => void;
}

const options: DataPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
  hasRecents: true,
};

export const DataPickerModal = ({
  databaseId,
  title,
  value,
  models = ["table", "card", "dataset"],
  onChange,
  onClose,
}: Props) => {
  const { tryLogRecentItem } = useLogRecentItem();

  const { data: databases } = useListDatabasesQuery({ saved: false });

  const recentFilter = useCallback(
    (recentItems: RecentItem[]) => {
      if (databaseId) {
        return recentItems.filter(
          item => "database_id" in item && item.database_id === databaseId,
        );
      }
      return recentItems;
    },
    [databaseId],
  );

  const searchParams = useMemo(() => {
    return databaseId ? { table_db_id: databaseId } : undefined;
  }, [databaseId]);

  const handleChange = useCallback(
    (item: NotebookDataPickerValueItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }

      const id =
        item.model === "table" ? item.id : getQuestionVirtualTableId(item.id);
      onChange(id);
      tryLogRecentItem(item);
      onClose();
    },
    [onChange, onClose, tryLogRecentItem],
  );

  const handleCardChange = useCallback(
    (item: QuestionPickerItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }
      onChange(getQuestionVirtualTableId(item.id));
      tryLogRecentItem(item);
      onClose();
    },
    [onChange, onClose, tryLogRecentItem],
  );

  const singleDatabase = useMemo(() => {
    if (databases?.data?.length === 1) {
      return databases.data[0];
    }
    if (databaseId) {
      return databases?.data?.find(db => db.id === databaseId) || null;
    }
    return null;
  }, [databases, databaseId]);

  console.log("singleDatabase: ", singleDatabase);

  const showRawDataTab = singleDatabase
    ? !singleDatabase.is_cube
    : true;

  const showSemanticLayerTab = singleDatabase
    ? singleDatabase.is_cube
    : true;

  const tabs: EntityTab<NotebookDataPickerValueItem["model"]>[] = [
    showRawDataTab && {
      displayName: t`Raw Data`,
      model: "table" as const,
      icon: "table",
      element: (
        <TablePicker
          databaseId={singleDatabase?.id}
          value={value}
          onChange={handleChange}
          shouldShowDatabase={database => database.is_cube === false}
        />
      ),
    },
    showSemanticLayerTab && {
      displayName: t`Semantic Layer`,
      model: "semantic" as const,
      icon: "table",
      element: (
        <TablePicker
          databaseId={singleDatabase?.id}
          value={value}
          onChange={handleChange}
          shouldShowDatabase={database => database.is_cube === true}
        />
      ),
    },
  ].filter(Boolean);

  return (
    <EntityPickerModal
      canSelectItem
      recentFilter={recentFilter}
      defaultToRecentTab={false}
      initialValue={value}
      options={options}
      searchParams={searchParams}
      selectedItem={value ?? null}
      tabs={tabs}
      title={title}
      onClose={onClose}
      onItemSelect={handleChange}
      recentsContext={["selections"]}
    />
  );
};
