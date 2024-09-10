import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
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
import { QuestionPicker, type QuestionPickerPath } from "../../QuestionPicker";
import { useAvailableData } from "../hooks";
import type {
  DataPickerItem,
  DataPickerModalOptions,
  DataPickerValue,
  TablePickerPath,
} from "../types";
import {
  castQuestionPickerItemToDataPickerItem,
  createShouldShowItem,
  isMetricItem,
  isModelItem,
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

const QUESTION_PICKER_MODELS: CollectionItemModel[] = ["card"];

const MODEL_PICKER_MODELS: CollectionItemModel[] = ["dataset"];

const METRIC_PICKER_MODELS: CollectionItemModel[] = ["metric"];

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
  const hasNestedQueriesEnabled = useSetting("enable-nested-queries");
  const { hasQuestions, hasModels, hasMetrics } = useAvailableData({
    databaseId,
  });

  const { tryLogRecentItem } = useLogRecentItem();

  const modelsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["dataset"], databaseId);
  }, [databaseId]);

  const metricsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["metric"], databaseId);
  }, [databaseId]);

  const questionsShouldShowItem = useMemo(() => {
    return createShouldShowItem(["card"], databaseId);
  }, [databaseId]);

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

  const [modelsPath, setModelsPath] = useState<QuestionPickerPath>();
  const [metricsPath, setMetricsPath] = useState<QuestionPickerPath>();
  const [questionsPath, setQuestionsPath] = useState<QuestionPickerPath>();
  const [tablesPath, setTablesPath] = useState<TablePickerPath>();

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      DataPickerItem["id"],
      DataPickerItem["model"],
      DataPickerItem
    >[] = [];

    if (hasModels && hasNestedQueriesEnabled && models.includes("dataset")) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        model: "dataset" as const,
        folderModels: ["collection" as const],
        icon: "model",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={isModelItem(value) ? value : undefined}
            models={MODEL_PICKER_MODELS}
            options={options}
            path={modelsPath}
            shouldShowItem={modelsShouldShowItem}
            onItemSelect={questionPickerItem => {
              const item =
                castQuestionPickerItemToDataPickerItem(questionPickerItem);
              onItemSelect(item);
            }}
            onPathChange={setModelsPath}
          />
        ),
      });
    }

    if (hasMetrics && hasNestedQueriesEnabled && models.includes("metric")) {
      computedTabs.push({
        id: "metrics-tab",
        displayName: t`Metrics`,
        model: "metric" as const,
        folderModels: ["collection" as const],
        icon: "metric",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={isMetricItem(value) ? value : undefined}
            models={METRIC_PICKER_MODELS}
            options={options}
            path={metricsPath}
            shouldShowItem={metricsShouldShowItem}
            onItemSelect={questionPickerItem => {
              const item =
                castQuestionPickerItemToDataPickerItem(questionPickerItem);
              onItemSelect(item);
            }}
            onPathChange={setMetricsPath}
          />
        ),
      });
    }

    if (models.includes("table")) {
      computedTabs.push({
        id: "tables-tab",
        displayName: t`Tables`,
        model: "table" as const,
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

    if (hasQuestions && hasNestedQueriesEnabled && models.includes("card")) {
      computedTabs.push({
        id: "questions-tab",
        displayName: t`Saved questions`,
        model: "card" as const,
        folderModels: ["collection" as const],
        icon: "folder",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={isQuestionItem(value) ? value : undefined}
            models={QUESTION_PICKER_MODELS}
            options={options}
            path={questionsPath}
            shouldShowItem={questionsShouldShowItem}
            onItemSelect={questionPickerItem => {
              const item =
                castQuestionPickerItemToDataPickerItem(questionPickerItem);
              onItemSelect(item);
            }}
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
    />
  );
};
