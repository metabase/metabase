import { useCallback, useMemo, useState } from "react";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Button, Checkbox, Icon, Popover } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  CollectionItemModel,
  DatabaseId,
  RecentContexts,
  RecentItem,
  TableId,
} from "metabase-types/api";

import type { EntityPickerTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import {
  QuestionPicker,
  type QuestionPickerStatePath,
} from "../../QuestionPicker";
import { useAvailableData } from "../hooks";
import type {
  DataPickerItem,
  DataPickerModalOptions,
  DataPickerValue,
  TablePickerStatePath,
} from "../types";
import {
  createQuestionPickerItemSelectHandler,
  createShouldShowItem,
  isCollectionItem,
  isTableItem,
  isValueItem,
} from "../utils";

import { TablePicker } from "./TablePicker";

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

type FilterOption = { label: string; value: CollectionItemModel };

const QUESTION_PICKER_MODELS: CollectionItemModel[] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
];

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

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
  const [modelFilter, setModelFilter] = useState<CollectionItemModel[]>(
    QUESTION_PICKER_MODELS,
  );
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");
  const {
    hasQuestions,
    hasModels,
    hasMetrics,
    isLoading: isLoadingAvailableData,
  } = useAvailableData({
    databaseId,
  });

  const questionPickerModalFilterOptions = useMemo(() => {
    const filterOptions: FilterOption[] = [];

    if (hasQuestions) {
      filterOptions.push({
        label: t`Saved questions`,
        value: "card" as const,
      });
    }
    if (hasModels) {
      filterOptions.push({
        label: t`Models`,
        value: "dataset" as const,
      });
    }
    if (hasMetrics) {
      filterOptions.push({
        label: t`Metrics`,
        value: "metric" as const,
      });
    }
    return filterOptions;
  }, [hasQuestions, hasModels, hasMetrics]);

  const { tryLogRecentItem } = useLogRecentItem();

  const shouldShowItem = useMemo(() => {
    return createShouldShowItem(modelFilter, databaseId);
  }, [databaseId, modelFilter]);

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

  const handleItemSelect = useCallback(
    (item: DataPickerItem) => {
      if (!isValueItem(item)) {
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

  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();

  const filterButton = (
    <FilterButton
      value={modelFilter}
      onChange={setModelFilter}
      options={questionPickerModalFilterOptions}
    />
  );

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      DataPickerItem["id"],
      DataPickerItem["model"],
      DataPickerItem
    >[] = [];

    if (models.includes("table")) {
      computedTabs.push({
        id: "tables-tab",
        displayName: t`Tables`,
        models: ["table" as const],
        folderModels: ["database" as const, "schema" as const],
        icon: "table",
        render: ({ onItemSelect }) => (
          <TablePicker
            databaseId={databaseId}
            path={tablesPath}
            value={isTableItem(value) ? value : undefined}
            onItemSelect={onItemSelect}
            onPathChange={setTablesPath}
          />
        ),
      });
    }

    const shouldShowCollectionsTab =
      (hasQuestions || hasMetrics || hasModels) &&
      hasNestedQueriesEnabled &&
      (models.includes("card") ||
        models.includes("dataset") ||
        models.includes("metric"));

    if (shouldShowCollectionsTab) {
      computedTabs.push({
        id: "questions-tab",
        displayName: t`Collections`,
        models: ["card" as const, "dataset" as const, "metric" as const],
        folderModels: ["collection" as const],
        icon: "folder",
        extraButtons: [filterButton],
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={isCollectionItem(value) ? value : undefined}
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
      searchParams={searchParams}
      selectedItem={value ?? null}
      tabs={tabs}
      title={title}
      onClose={onClose}
      onItemSelect={handleItemSelect}
      isLoadingTabs={isLoadingAvailableData}
      searchExtraButtons={[filterButton]}
    />
  );
};

const FilterButton = ({
  value,
  onChange,
  options,
}: {
  value: CollectionItemModel[];
  onChange: (value: CollectionItemModel[]) => void;
  options: FilterOption[];
}) => {
  return (
    <Popover zIndex={450}>
      <Popover.Target>
        <Button leftIcon={<Icon name="filter" />} variant="subtle">{c(
          "A verb, not a noun",
        ).t`Filter`}</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Checkbox.Group value={value} onChange={onChange} px="1rem" py="0.5rem">
          {options.map(option => (
            <Checkbox
              key={`filter-${option.value}`}
              label={option.label}
              value={option.value}
              my="1rem"
            />
          ))}
        </Checkbox.Group>
      </Popover.Dropdown>
    </Popover>
  );
};
