import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

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
  // isMetricItem,
  // isModelItem,
  isQuestionItem,
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

const QUESTION_PICKER_MODELS: CollectionItemModel[] = [
  "card",
  "dataset",
  "metric",
];

const QUESITON_PICKER_MODEL_FILTER_OPTIONS = [
  {
    label: t`Metrics`,
    value: "metric" as const,
  },
  {
    label: t`Models`,
    value: "dataset" as const,
  },
  {
    label: t`Saved questions`,
    value: "card" as const,
  },
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

  // const [modelsPath, setModelsPath] = useState<QuestionPickerStatePath>();
  // const [metricsPath, setMetricsPath] = useState<QuestionPickerStatePath>();
  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();

  const filterButton = (
    <FilterButton
      value={modelFilter}
      onChange={setModelFilter}
      options={QUESITON_PICKER_MODEL_FILTER_OPTIONS}
    />
  );

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      DataPickerItem["id"],
      DataPickerItem["model"],
      DataPickerItem
    >[] = [];

    // if (hasModels && hasNestedQueriesEnabled && models.includes("dataset")) {
    //   computedTabs.push({
    //     id: "models-tab",
    //     displayName: t`Models`,
    //     model: "dataset" as const,
    //     folderModels: ["collection" as const],
    //     icon: "model",
    //     render: ({ onItemSelect }) => (
    //       <QuestionPicker
    //         initialValue={isModelItem(value) ? value : undefined}
    //         models={MODEL_PICKER_MODELS}
    //         options={options}
    //         path={modelsPath}
    //         shouldShowItem={modelsShouldShowItem}
    //         onInit={createQuestionPickerItemSelectHandler(onItemSelect)}
    //         onItemSelect={createQuestionPickerItemSelectHandler(onItemSelect)}
    //         onPathChange={setModelsPath}
    //       />
    //     ),
    //   });
    // }

    // if (hasMetrics && hasNestedQueriesEnabled && models.includes("metric")) {
    //   computedTabs.push({
    //     id: "metrics-tab",
    //     displayName: t`Metrics`,
    //     model: "metric" as const,
    //     folderModels: ["collection" as const],
    //     icon: "metric",
    //     render: ({ onItemSelect }) => (
    //       <QuestionPicker
    //         initialValue={isMetricItem(value) ? value : undefined}
    //         models={METRIC_PICKER_MODELS}
    //         options={options}
    //         path={metricsPath}
    //         shouldShowItem={metricsShouldShowItem}
    //         onInit={createQuestionPickerItemSelectHandler(onItemSelect)}
    //         onItemSelect={createQuestionPickerItemSelectHandler(onItemSelect)}
    //         onPathChange={setMetricsPath}
    //       />
    //     ),
    //   });
    // }

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

    if (
      (hasQuestions || hasMetrics || hasModels) &&
      hasNestedQueriesEnabled &&
      models.includes("card")
    ) {
      computedTabs.push({
        id: "questions-tab",
        displayName: t`Collections`,
        models: ["card" as const, "dataset" as const, "metric" as const],
        folderModels: ["collection" as const],
        icon: "folder",
        extraButtons: [filterButton],
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={isQuestionItem(value) ? value : undefined}
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
      searchResultFilter={items => items.filter(shouldShowItem)}
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
  options: { label: string; value: CollectionItemModel }[];
}) => {
  return (
    <Popover zIndex={1000}>
      <Popover.Target>
        <Button
          leftIcon={<Icon name="filter" />}
          variant="subtle"
        >{t`Filter`}</Button>
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
