import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  CollectionId,
  CollectionItemModel,
  TableId,
} from "metabase-types/api";

import type { EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type { QuestionPickerItem } from "../../QuestionPicker";
import { QuestionPicker } from "../../QuestionPicker";
import type {
  DataPickerModalOptions,
  DataPickerValue,
  NotebookDataPickerValueItem,
} from "../types";
import { isModelItem, isQuestionItem, isTableItem } from "../utils";

import { TablePicker } from "./TablePicker";

interface Props {
  /**
   * TODO: use this prop in https://github.com/metabase/metabase/issues/40719
   */
  collectionId: CollectionId | null | undefined;
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
  const handleTableChange = useCallback(
    (item: NotebookDataPickerValueItem) => {
      onChange(item.id);
      onClose();
    },
    [onChange, onClose],
  );

  const handleModelChange = useCallback(
    (item: QuestionPickerItem) => {
      if (item.model === "dataset") {
        onChange(getQuestionVirtualTableId(item.id));
        onClose();
      }
    },
    [onChange, onClose],
  );

  const handleQuestionChange = useCallback(
    (item: QuestionPickerItem) => {
      if (item.model === "card") {
        onChange(getQuestionVirtualTableId(item.id));
        onClose();
      }
    },
    [onChange, onClose],
  );

  const tabs: EntityTab<NotebookDataPickerValueItem["model"]>[] = [
    {
      displayName: t`Models`,
      model: "dataset",
      icon: "model",
      element: (
        <QuestionPicker
          initialValue={isModelItem(value) ? value : undefined}
          models={MODEL_PICKER_MODELS}
          options={options}
          onItemSelect={handleModelChange}
        />
      ),
    },
    {
      displayName: t`Tables`,
      model: "table",
      icon: "table",
      element: (
        <TablePicker
          value={isTableItem(value) ? value : undefined}
          onChange={handleTableChange}
        />
      ),
    },
    {
      displayName: t`Saved questions`,
      model: "card",
      icon: "folder",
      element: (
        <QuestionPicker
          initialValue={isQuestionItem(value) ? value : undefined}
          models={QUESTION_PICKER_MODELS}
          options={options}
          onItemSelect={handleQuestionChange}
        />
      ),
    },
  ];

  return (
    <EntityPickerModal
      canSelectItem
      initialValue={value}
      options={options}
      selectedItem={value ?? null}
      tabs={tabs}
      title={t`Pick your starting data`}
      onClose={onClose}
      onConfirm={_.noop} // onConfirm is unused when options.hasConfirmButtons is falsy
      onItemSelect={handleTableChange}
    />
  );
};
