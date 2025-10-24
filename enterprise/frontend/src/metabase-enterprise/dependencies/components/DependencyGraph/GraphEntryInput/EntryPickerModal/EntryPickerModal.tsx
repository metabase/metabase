import { useMemo, useState } from "react";
import { t } from "ttag";

import { useLogRecentItemMutation, useSearchQuery } from "metabase/api";
import {
  EntityPickerModal,
  type EntityPickerTab,
} from "metabase/common/components/EntityPicker";
import {
  QuestionPicker,
  type QuestionPickerStatePath,
} from "metabase/common/components/Pickers/QuestionPicker";
import {
  TablePicker,
  type TablePickerStatePath,
} from "metabase/common/components/Pickers/TablePicker";
import { PLUGIN_TRANSFORMS } from "metabase/plugins";
import {
  type DependencyEntry,
  type DependencyNode,
  isActivityModel,
} from "metabase-types/api";

import {
  ENTITY_PICKER_OPTIONS,
  QUESTION_PICKER_OPTIONS,
  RECENTS_CONTEXT,
} from "./constants";
import type {
  EntryPickerItem,
  EntryPickerItemId,
  EntryPickerItemModel,
} from "./types";
import {
  getEntryPickerItem,
  getEntryPickerValue,
  getMetricPickerItem,
  getModelPickerItem,
  getQuestionPickerItem,
  getTablePickerValue,
  getTransformPickerItem,
  hasAvailableModels,
} from "./utils";

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
  const [tablesPath, setTablesPath] = useState<TablePickerStatePath>();
  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();
  const [modelsPath, setModelsPath] = useState<QuestionPickerStatePath>();
  const [metricsPath, setMetricsPath] = useState<QuestionPickerStatePath>();
  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery({
    models: ["card"],
    limit: 0,
    calculate_available_models: true,
  });
  const [logRecentItem] = useLogRecentItemMutation();

  const selectedItem = useMemo(() => {
    return value != null ? getEntryPickerItem(value) : undefined;
  }, [value]);

  const tabs = useMemo(() => {
    const computedTabs: EntityPickerTab<
      EntryPickerItemId,
      EntryPickerItemModel,
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
          value={value ? getTablePickerValue(value) : undefined}
          path={tablesPath}
          onItemSelect={onItemSelect}
          onPathChange={setTablesPath}
        />
      ),
    });

    if (hasAvailableModels(searchResponse, ["transform"])) {
      computedTabs.push({
        id: "transforms-tab",
        displayName: t`Transforms`,
        models: ["transform"],
        folderModels: [],
        icon: "refresh_downstream",
        render: ({ onItemSelect }) => (
          <PLUGIN_TRANSFORMS.TransformPicker
            value={value ? getTransformPickerItem(value) : undefined}
            onItemSelect={onItemSelect}
          />
        ),
      });
    }

    if (hasAvailableModels(searchResponse, ["card"])) {
      computedTabs.push({
        id: "questions-tab",
        displayName: t`Questions`,
        models: ["card"],
        folderModels: ["collection", "dashboard"],
        icon: "table2",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={value ? getQuestionPickerItem(value) : undefined}
            models={["card", "dashboard"]}
            options={QUESTION_PICKER_OPTIONS}
            path={questionsPath}
            onInit={onItemSelect}
            onItemSelect={onItemSelect}
            onPathChange={setQuestionsPath}
          />
        ),
      });
    }

    if (hasAvailableModels(searchResponse, ["dataset"])) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        models: ["dataset"],
        folderModels: ["collection"],
        icon: "model",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={value ? getModelPickerItem(value) : undefined}
            models={["dataset"]}
            options={QUESTION_PICKER_OPTIONS}
            path={modelsPath}
            onInit={onItemSelect}
            onItemSelect={onItemSelect}
            onPathChange={setModelsPath}
          />
        ),
      });
    }

    if (hasAvailableModels(searchResponse, ["metric"])) {
      computedTabs.push({
        id: "metrics-tab",
        displayName: t`Metrics`,
        models: ["metric"],
        folderModels: ["collection"],
        icon: "metric",
        render: ({ onItemSelect }) => (
          <QuestionPicker
            initialValue={value ? getMetricPickerItem(value) : undefined}
            models={["metric"]}
            options={QUESTION_PICKER_OPTIONS}
            path={metricsPath}
            onInit={onItemSelect}
            onItemSelect={onItemSelect}
            onPathChange={setMetricsPath}
          />
        ),
      });
    }

    return computedTabs;
  }, [
    value,
    searchResponse,
    tablesPath,
    questionsPath,
    modelsPath,
    metricsPath,
  ]);

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
      title={t`Pick an item to see its dependencies`}
      tabs={tabs}
      initialValue={selectedItem}
      selectedItem={selectedItem ?? null}
      options={ENTITY_PICKER_OPTIONS}
      recentsContext={RECENTS_CONTEXT}
      isLoadingTabs={isSearchLoading}
      canSelectItem
      defaultToRecentTab={false}
      onItemSelect={handleItemSelect}
      onClose={onClose}
    />
  );
}
