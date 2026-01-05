import { useCallback, useMemo, useState } from "react";
import { c, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Button, Checkbox, Icon, Popover } from "metabase/ui";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  DatabaseId,
  RecentContexts,
  RecentItem,
  TableId,
} from "metabase-types/api";

import type { EntityPickerTab } from "../../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../../EntityPicker";
import { useLogRecentItem } from "../../../EntityPicker/hooks/use-log-recent-item";
import type { CollectionPickerItem } from "../../CollectionPicker";
import {
  QuestionPicker,
  type QuestionPickerModel,
  type QuestionPickerStatePath,
} from "../../QuestionPicker";
import { TablePicker } from "../../TablePicker";
import type { TablePickerStatePath } from "../../TablePicker/types";
import { useAvailableData } from "../hooks";
import type {
  DataPickerItem,
  DataPickerModalOptions,
  DataPickerValue,
} from "../types";
import {
  createQuestionPickerItemSelectHandler,
  createShouldShowItem,
  getRecentItemDatabaseId,
  isTableItem,
  isValueItem,
} from "../utils";

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
  shouldDisableItem?: (
    item: DataPickerItem | CollectionPickerItem | RecentItem,
  ) => boolean;
  options?: DataPickerModalOptions;
}

type FilterOption = { label: string; value: QuestionPickerModel };

const QUESTION_PICKER_MODELS: QuestionPickerModel[] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "table",
];

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

const OPTIONS: DataPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
  showLibrary: true,
  showDatabases: true,
  hasRecents: true,
};

export const DataPickerModal = ({
  databaseId,
  title,
  value,
  onChange,
  onClose,
  shouldDisableItem,
  options,
  models = ["card", "dataset", "metric", "table"],
}: Props) => {
  options = {
    ...OPTIONS,
    ...options,
  };
  const [modelFilter, setModelFilter] = useState<QuestionPickerModel[]>(
    QUESTION_PICKER_MODELS,
  );
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");

  const {
    hasQuestions,
    hasModels,
    hasMetrics,
    hasTables,
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
    if (hasTables) {
      filterOptions.push({
        label: t`Tables`,
        value: "table" as const,
      });
    }
    return filterOptions;
  }, [hasQuestions, hasModels, hasMetrics, hasTables]);

  const { tryLogRecentItem } = useLogRecentItem();

  const shouldShowItem = useMemo(() => {
    return createShouldShowItem(modelFilter, databaseId);
  }, [databaseId, modelFilter]);

  const recentFilter = useCallback(
    (recentItems: RecentItem[]) => {
      return recentItems.filter((item) => {
        if (databaseId && getRecentItemDatabaseId(item) !== databaseId) {
          return false;
        }
        if (shouldDisableItem) {
          // Do not show items that are disabled in recents
          return !shouldDisableItem(item);
        }
        return true;
      });
    },
    [databaseId, shouldDisableItem],
  );

  const searchParams = useMemo(() => {
    const tableParams = databaseId ? { table_db_id: databaseId } : undefined;
    return {
      include_dashboard_questions: true,
      ...tableParams,
    };
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

    const hasOnlyTableModels =
      models != null && models.length === 1 && models[0] === "table";
    if (hasOnlyTableModels || !hasNestedQueriesEnabled) {
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
            shouldDisableItem={shouldDisableItem}
          />
        ),
      });
    } else {
      computedTabs.push({
        id: "questions-tab",
        displayName: t`Data`,
        models,
        folderModels: ["collection", "dashboard", "schema", "database"],
        icon: "folder",
        extraButtons: [filterButton],
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={value}
            models={[
              ...models,
              ...(models.includes("card") ? ["dashboard" as const] : []),
            ]}
            options={options}
            path={questionsPath}
            shouldShowItem={shouldShowItem}
            onInit={createQuestionPickerItemSelectHandler(onItemSelect)}
            onItemSelect={createQuestionPickerItemSelectHandler(onItemSelect)}
            onPathChange={setQuestionsPath}
            shouldDisableItem={shouldDisableItem}
            tablesPath={tablesPath}
            onTablesPathChange={setTablesPath}
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
      searchModels={models}
    />
  );
};

const FilterButton = ({
  value,
  onChange,
  options,
}: {
  value: QuestionPickerModel[];
  onChange: (value: QuestionPickerModel[]) => void;
  options: FilterOption[];
}) => {
  return (
    <Popover zIndex={450}>
      <Popover.Target>
        <Button leftSection={<Icon name="filter" />} variant="subtle">{c(
          "A verb, not a noun",
        ).t`Filter`}</Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Checkbox.Group
          value={value}
          onChange={(newValues: string[]) =>
            onChange(newValues as QuestionPickerModel[])
          }
          px="1rem"
          py="0.5rem"
        >
          {options.map((option) => (
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
