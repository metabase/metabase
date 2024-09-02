import { t } from "ttag";

import type { CollectionItemModel } from "metabase-types/api";

import type { EntityPickerTab } from "../../EntityPicker";
import { QuestionPicker, type QuestionPickerItem } from "../../QuestionPicker";
import type {
  DataPickerItem,
  DataPickerModalOptions,
  DataPickerValue,
} from "../types";
import {
  castQuestionPickerItemToDataPickerItem,
  isMetricItem,
  isModelItem,
  isQuestionItem,
  isTableItem,
} from "../utils";

import { TablePicker } from "./TablePicker";

const QUESTION_PICKER_MODELS: CollectionItemModel[] = ["card"];

const MODEL_PICKER_MODELS: CollectionItemModel[] = ["dataset"];

const METRIC_PICKER_MODELS: CollectionItemModel[] = ["metric"];

interface Props {
  databaseId: number | undefined;
  hasMetrics: boolean;
  hasModels: boolean;
  hasNestedQueriesEnabled: boolean;
  hasQuestions: boolean;
  models: ("table" | "dataset" | "metric" | "card")[];
  options: DataPickerModalOptions;
  value: DataPickerValue | undefined;
  metricsShouldShowItem: (item: QuestionPickerItem) => boolean;
  modelsShouldShowItem: (item: QuestionPickerItem) => boolean;
  questionsShouldShowItem: (item: QuestionPickerItem) => boolean;
}

export function getTabs({
  databaseId,
  hasMetrics,
  hasModels,
  hasNestedQueriesEnabled,
  hasQuestions,
  models,
  options,
  value,
  metricsShouldShowItem,
  modelsShouldShowItem,
  questionsShouldShowItem,
}: Props): EntityPickerTab<
  DataPickerItem["id"],
  DataPickerItem["model"],
  DataPickerItem
>[] {
  const tabs: EntityPickerTab<
    DataPickerItem["id"],
    DataPickerItem["model"],
    DataPickerItem
  >[] = [];

  if (hasModels && hasNestedQueriesEnabled && models.includes("dataset")) {
    tabs.push({
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
          shouldShowItem={modelsShouldShowItem}
          onItemSelect={questionPickerItem => {
            const item =
              castQuestionPickerItemToDataPickerItem(questionPickerItem);
            onItemSelect(item);
          }}
        />
      ),
    });
  }

  if (hasMetrics && hasNestedQueriesEnabled && models.includes("metric")) {
    tabs.push({
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
          shouldShowItem={metricsShouldShowItem}
          onItemSelect={questionPickerItem => {
            const item =
              castQuestionPickerItemToDataPickerItem(questionPickerItem);
            onItemSelect(item);
          }}
        />
      ),
    });
  }

  if (models.includes("table")) {
    tabs.push({
      id: "tables-tab",
      displayName: t`Tables`,
      model: "table" as const,
      folderModels: ["database" as const, "schema" as const],
      icon: "table",
      render: ({ onItemSelect }) => (
        <TablePicker
          databaseId={databaseId}
          value={isTableItem(value) ? value : undefined}
          onItemSelect={onItemSelect}
        />
      ),
    });
  }

  if (hasQuestions && hasNestedQueriesEnabled && models.includes("card")) {
    tabs.push({
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
          shouldShowItem={questionsShouldShowItem}
          onItemSelect={questionPickerItem => {
            const item =
              castQuestionPickerItemToDataPickerItem(questionPickerItem);
            onItemSelect(item);
          }}
        />
      ),
    });
  }

  return tabs;
}
