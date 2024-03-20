import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import type { EntityTab } from "../../types";
import { EntityPickerModal, defaultOptions } from "../EntityPickerModal";

import {
  NotebookDataPicker,
  type NotebookDataPickerOptions,
} from "./NotebookDataPicker";
import { TablePicker } from "./TablePicker";
import type { NotebookDataPickerItem } from "./types";

interface Props {
  title?: string;
  onChange: (item: NotebookDataPickerItem) => void;
  onClose: () => void;
  options?: NotebookDataPickerOptions;
  value: Pick<NotebookDataPickerItem, "id" | "model">;
}

export const NotebookDataPickerModal = ({
  options = defaultOptions,
  title = t`Select a table`,
  value,
  onChange,
  onClose,
}: Props) => {
  const [selectedItem, setSelectedItem] =
    useState<NotebookDataPickerItem | null>(null);

  const pickerRef = useRef<{
    onFolderSelect: (item: { folder: NotebookDataPickerItem }) => void;
  }>();

  const handleItemSelect = useCallback(
    (item: NotebookDataPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else {
        onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = () => {
    if (selectedItem) {
      onChange(selectedItem);
    }
  };

  const tabs: [EntityTab, ...EntityTab[]] = [
    {
      displayName: t`Models`,
      model: "model",
      icon: "model",
      element: (
        <NotebookDataPicker
          initialValue={value}
          options={options}
          ref={pickerRef}
          onItemSelect={handleItemSelect}
        />
      ),
    },
    {
      displayName: t`Tables`,
      model: "table",
      icon: "table",
      element: (
        <TablePicker
          initialValue={value}
          options={options}
          ref={pickerRef}
          onItemSelect={handleItemSelect}
        />
      ),
    },
    {
      displayName: t`Saved questions`,
      model: "question",
      icon: "folder",
      element: (
        <NotebookDataPicker
          initialValue={value}
          options={options}
          ref={pickerRef}
          onItemSelect={handleItemSelect}
        />
      ),
    },
  ];

  return (
    <>
      <EntityPickerModal
        canSelectItem
        options={options}
        selectedItem={selectedItem}
        tabs={tabs}
        title={title}
        onClose={onClose}
        onConfirm={handleConfirm}
        onItemSelect={handleItemSelect}
      />
    </>
  );
};
