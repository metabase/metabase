import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type DataPickerItem,
  type DataPickerModalOptions,
  type DataPickerValue,
  type ModelItem,
  type TableItem,
  type TablePickerStatePath,
  createQuestionPickerItemSelectHandler,
  createShouldShowItem,
  isModelItem,
  isTableItem,
} from "metabase/common/components/DataPicker";
import { TablePicker } from "metabase/common/components/DataPicker/components/TablePicker";
import { useAvailableData } from "metabase/common/components/DataPicker/hooks";
import {
  EntityPickerModal,
  type EntityPickerTab,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import { useLogRecentItem } from "metabase/common/components/EntityPicker/hooks";
import {
  QuestionPicker,
  type QuestionPickerStatePath,
} from "metabase/common/components/QuestionPicker";
import { useSetting } from "metabase/common/hooks";
import type {
  CollectionItemModel,
  RecentContexts,
  RecentItem,
} from "metabase-types/api";

export type TableActionTargetEntity = TableItem | ModelItem;

type TableActionPickerProps = {
  value: TableActionTargetEntity | undefined;
  onChange: (entity: TableActionTargetEntity) => void;
  onClose: () => void;
};

const ENTITY_TYPES: DataPickerItem["model"][] = ["table", "dataset"];

const QUESTION_PICKER_MODELS: CollectionItemModel[] = ["dataset"];

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

const SEARCH_PARAMS = {
  include_dashboard_questions: true,
};

const options: DataPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
  hasRecents: true,
};

const isValidItem = (item: DataPickerItem): item is TableActionTargetEntity => {
  return ENTITY_TYPES.includes(item.model);
};

export const TableOrModelDataPicker = ({
  value,
  onChange,
  onClose,
}: TableActionPickerProps) => {
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");
  const { hasModels, isLoading: isLoadingAvailableData } = useAvailableData({
    databaseId: undefined,
    models: ["dataset"],
  });

  const { tryLogRecentItem } = useLogRecentItem();

  const shouldShowItem = useMemo(() => {
    return createShouldShowItem(QUESTION_PICKER_MODELS);
  }, []);

  const recentFilter = useCallback(
    (recentItems: RecentItem[]) => recentItems,
    [],
  );

  const handleItemSelect = useCallback(
    (item: DataPickerItem) => {
      if (!isValidItem(item)) {
        return;
      }

      onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
  );

  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      DataPickerItem["id"],
      DataPickerItem["model"],
      DataPickerItem
    >[] = [];

    if (ENTITY_TYPES.includes("table")) {
      computedTabs.push({
        id: "tables-tab",
        displayName: t`Tables`,
        models: ["table" as const],
        folderModels: ["database" as const, "schema" as const],
        icon: "table",
        render: ({ onItemSelect }) => (
          <TablePicker
            path={tablesPath}
            value={isTableItem(value as DataPickerValue) ? value : undefined}
            onItemSelect={onItemSelect}
            onPathChange={setTablesPath}
          />
        ),
      });
    }

    const shouldShowCollectionsTab = hasModels && hasNestedQueriesEnabled;

    if (shouldShowCollectionsTab) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        models: ["dataset" as const],
        folderModels: ["collection" as const, "dashboard" as const],
        icon: "folder",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={
              isModelItem(value as DataPickerValue) ? value : undefined
            }
            models={QUESTION_PICKER_MODELS}
            options={options}
            path={questionsPath}
            shouldShowItem={shouldShowItem}
            onInit={createQuestionPickerItemSelectHandler(onItemSelect)}
            onItemSelect={createQuestionPickerItemSelectHandler(onItemSelect)}
            onPathChange={setQuestionsPath}
          />
        ),
      });
    }

    return computedTabs;
  })();

  return (
    <EntityPickerModal
      canSelectItem
      defaultToRecentTab={false}
      initialValue={value}
      options={options}
      recentsContext={RECENTS_CONTEXT}
      recentFilter={recentFilter}
      searchParams={SEARCH_PARAMS}
      selectedItem={value ?? null}
      tabs={tabs}
      title={t`Pick action to add`}
      onClose={onClose}
      onItemSelect={handleItemSelect}
      isLoadingTabs={isLoadingAvailableData}
    />
  );
};
