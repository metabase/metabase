import { useCallback, useState } from "react";
import { t } from "ttag";

import type { CollectionPickerModel } from "../../CollectionPicker";
import type { EntityTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import type {
  QuestionPickerItem,
  QuestionPickerOptions,
  QuestionPickerModel,
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
  value?: Pick<QuestionPickerItem, "id" | "model">;
  models?: QuestionPickerModel[];
}

const canSelectItem = (
  item: QuestionPickerItem | null,
): item is QuestionPickerValueItem => {
  return (
    !!item &&
    item.can_write !== false &&
    (item.model === "card" || item.model === "dataset")
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

  const handleItemSelect = useCallback(
    (item: QuestionPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else if (canSelectItem(item)) {
        onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = () => {
    if (selectedItem && canSelectItem(selectedItem)) {
      onChange(selectedItem);
    }
  };

  const tabs: EntityTab<CollectionPickerModel>[] = [
    {
      displayName: t`Questions`,
      model: "card",
      icon: "table",
      element: (
        <QuestionPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          models={["card"]}
        />
      ),
    },
    {
      displayName: t`Models`,
      model: "dataset",
      icon: "model",
      element: (
        <QuestionPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          models={["dataset"]}
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
