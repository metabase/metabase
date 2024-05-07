import { useCallback } from "react";
import { t } from "ttag";

import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  CollectionItemModel,
  DatabaseId,
  TableId,
} from "metabase-types/api";

import type { EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type { QuestionPickerItem } from "../../QuestionPicker";
import { QuestionPicker } from "../../QuestionPicker";
import { useAvailableData } from "../hooks";
import type {
  DataPickerModalOptions,
  DataPickerValue,
  NotebookDataPickerValueItem,
} from "../types";
import {
  isModelItem,
  isQuestionItem,
  isTableItem,
  isValidValueItem,
} from "../utils";

import { TablePicker } from "./TablePicker";

interface Props {
  /**
   * Limit selection to a particular database
   */
  databaseId?: DatabaseId | null;
  value: DataPickerValue | undefined;
  onChange: (value: TableId) => void;
  onClose: () => void;
}

const MODEL_PICKER_MODELS: CollectionItemModel[] = ["dataset"];

const QUESTION_PICKER_MODELS: CollectionItemModel[] = ["card"];

const options: DataPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  showPersonalCollections: true,
  showRootCollection: true,
};

export const DataPickerModal = ({ value, onChange, onClose }: Props) => {
  const { hasModels, hasQuestions } = useAvailableData();

  const handleChange = useCallback(
    (item: NotebookDataPickerValueItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }

      const id =
        item.model === "table" ? item.id : getQuestionVirtualTableId(item.id);
      onChange(id);
      onClose();
    },
    [onChange, onClose],
  );

  const handleCardChange = useCallback(
    (item: QuestionPickerItem) => {
      if (!isValidValueItem(item.model)) {
        return;
      }

      onChange(getQuestionVirtualTableId(item.id));
      onClose();
    },
    [onChange, onClose],
  );

  const tabs: EntityTab<NotebookDataPickerValueItem["model"]>[] = [
    hasModels
      ? {
          displayName: t`Models`,
          model: "dataset",
          icon: "model",
          element: (
            <QuestionPicker
              initialValue={isModelItem(value) ? value : undefined}
              models={MODEL_PICKER_MODELS}
              options={options}
              onItemSelect={handleCardChange}
            />
          ),
        }
      : undefined,
    {
      displayName: t`Tables`,
      model: "table",
      icon: "table",
      element: (
        <TablePicker
          value={isTableItem(value) ? value : undefined}
          onChange={handleChange}
        />
      ),
    },
    hasQuestions
      ? {
          displayName: t`Saved questions`,
          model: "card",
          icon: "folder",
          element: (
            <QuestionPicker
              initialValue={isQuestionItem(value) ? value : undefined}
              models={QUESTION_PICKER_MODELS}
              options={options}
              onItemSelect={handleCardChange}
            />
          ),
        }
      : undefined,
  ].filter(
    (tab): tab is EntityTab<NotebookDataPickerValueItem["model"]> =>
      tab != null,
  );

  return (
    <EntityPickerModal
      canSelectItem
      initialValue={value}
      options={options}
      selectedItem={value ?? null}
      tabs={tabs}
      title={t`Pick your starting data`}
      onClose={onClose}
      onItemSelect={handleChange}
    />
  );
};
