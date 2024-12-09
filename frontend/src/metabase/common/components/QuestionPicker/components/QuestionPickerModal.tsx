import { useCallback, useState } from "react";
import { t } from "ttag";

import type { EntityPickerTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import type {
  QuestionPickerItem,
  QuestionPickerModel,
  QuestionPickerOptions,
  QuestionPickerStatePath,
  QuestionPickerValue,
  QuestionPickerValueItem,
} from "../types";

import {
  QuestionPicker,
  defaultOptions as defaultQuestionPickerOptions,
} from "./QuestionPicker";

interface QuestionPickerModalProps {
  title?: string;
  onChange: (item: QuestionPickerValueItem) => void;
  onClose: () => void;
  options?: QuestionPickerOptions;
  value?: QuestionPickerValue;
  models?: QuestionPickerModel[];
}

const canSelectItem = (
  item: QuestionPickerItem | null,
): item is QuestionPickerValueItem => {
  return (
    item != null &&
    (item.model === "card" ||
      item.model === "dataset" ||
      item.model === "metric")
  );
};

const defaultOptions: QuestionPickerOptions = {
  ...defaultEntityPickerOptions,
  ...defaultQuestionPickerOptions,
};

export const QuestionPickerModal = ({
  title = t`Choose a question or model`,
  onChange,
  onClose,
  value = { model: "collection", id: "root" },
  options = defaultOptions,
  models = ["card", "dataset"],
}: QuestionPickerModalProps) => {
  options = { ...defaultOptions, ...options };
  const [selectedItem, setSelectedItem] = useState<QuestionPickerItem | null>(
    null,
  );
  const { tryLogRecentItem } = useLogRecentItem();

  const handleOnChange = useCallback(
    (item: QuestionPickerValueItem) => {
      onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
  );

  const handleItemSelect = useCallback(
    (item: QuestionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else if (canSelectItem(item)) {
        handleOnChange(item);
      }
    },
    [handleOnChange, options],
  );

  const handleConfirm = () => {
    if (selectedItem && canSelectItem(selectedItem)) {
      handleOnChange(selectedItem);
    }
  };

  const [modelsPath, setModelsPath] = useState<QuestionPickerStatePath>();
  const [metricsPath, setMetricsPath] = useState<QuestionPickerStatePath>();
  const [questionsPath, setQuestionsPath] = useState<QuestionPickerStatePath>();

  const tabs: EntityPickerTab<
    QuestionPickerItem["id"],
    QuestionPickerItem["model"],
    QuestionPickerItem
  >[] = [
    {
      id: "questions-tab",
      displayName: t`Questions`,
      model: "card" as const,
      folderModels: ["collection" as const],
      icon: "table",
      render: ({ onItemSelect }) => (
        <QuestionPicker
          initialValue={value}
          models={["card"]}
          options={options}
          path={questionsPath}
          onInit={onItemSelect}
          onItemSelect={onItemSelect}
          onPathChange={setQuestionsPath}
        />
      ),
    },
    {
      id: "models-tab",
      displayName: t`Models`,
      model: "dataset" as const,
      folderModels: ["collection" as const],
      icon: "model",
      render: ({ onItemSelect }) => (
        <QuestionPicker
          initialValue={value}
          models={["dataset"]}
          options={options}
          path={modelsPath}
          onInit={onItemSelect}
          onItemSelect={onItemSelect}
          onPathChange={setModelsPath}
        />
      ),
    },
    {
      id: "metrics-tab",
      displayName: t`Metrics`,
      model: "metric" as const,
      folderModels: ["collection" as const],
      icon: "metric",
      render: ({ onItemSelect }) => (
        <QuestionPicker
          initialValue={value}
          models={["metric"]}
          options={options}
          path={metricsPath}
          onInit={onItemSelect}
          onItemSelect={onItemSelect}
          onPathChange={setMetricsPath}
        />
      ),
    },
  ];

  const filteredTabs = tabs.filter(tab =>
    models.includes(tab.model as QuestionPickerModel),
  );

  return (
    <EntityPickerModal
      title={title}
      onItemSelect={handleItemSelect}
      canSelectItem={canSelectItem(selectedItem)}
      onConfirm={handleConfirm}
      onClose={onClose}
      selectedItem={selectedItem}
      initialValue={value}
      tabs={filteredTabs}
      options={options}
      searchParams={
        options.showRootCollection === false
          ? { filter_items_in_personal_collection: "only" }
          : options.showPersonalCollections === false
            ? { filter_items_in_personal_collection: "exclude" }
            : undefined
      }
      searchResultFilter={results => results}
      actionButtons={[]}
    />
  );
};
