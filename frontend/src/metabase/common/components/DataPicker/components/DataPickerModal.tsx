import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import type { TableId } from "metabase-types/api";

import type { EntityPickerOptions, EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type {
  NotebookDataPickerItem,
  NotebookDataPickerValueItem,
} from "../types";

import { TablePicker } from "./TablePicker";

interface Props {
  title?: string;
  onChange: (item: NotebookDataPickerItem) => void;
  onClose: () => void;
  options?: EntityPickerOptions;
  value: TableId | null;
}

export const DataPickerModal = ({
  options = defaultOptions,
  title = t`Pick your starting data`,
  value,
  onChange,
  onClose,
}: Props) => {
  const [selectedItem, setSelectedItem] =
    useState<NotebookDataPickerValueItem | null>(null);

  const pickerRef = useRef<{
    onFolderSelect: (item: { folder: NotebookDataPickerItem }) => void;
  }>();

  const handleItemSelect = useCallback(
    (item: NotebookDataPickerValueItem) => {
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
      onClose();
    }
  };

  const tabs: [
    EntityTab<NotebookDataPickerValueItem["model"]>,
    ...EntityTab<NotebookDataPickerValueItem["model"]>[],
  ] = [
    // {
    //   displayName: t`Models`,
    //   model: "dataset",
    //   icon: "model",
    //   element: (
    //     <NotebookDataPicker
    //       initialValue={value}
    //       options={options}
    //       ref={pickerRef}
    //       onItemSelect={handleItemSelect}
    //     />
    //   ),
    // },
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
    // {
    //   displayName: t`Saved questions`,
    //   model: "card",
    //   icon: "folder",
    //   element: (
    //     <NotebookDataPicker
    //       initialValue={value}
    //       options={options}
    //       ref={pickerRef}
    //       onItemSelect={handleItemSelect}
    //     />
    //   ),
    // },
  ];

  return (
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
  );
};
