import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import type { CollectionPickerItem, EntityTab } from "../../types";
import { EntityPickerModal, defaultOptions } from "../EntityPickerModal";

import { TablePicker, type TablePickerOptions } from "./TablePicker";

interface Props {
  title?: string;
  onChange: (item: CollectionPickerItem) => void;
  onClose: () => void;
  options?: TablePickerOptions;
  value: Pick<CollectionPickerItem, "id" | "model">;
}

export const TablePickerModal = ({
  options = defaultOptions,
  title = t`Choose a collection`,
  value,
  onChange,
  onClose,
}: Props) => {
  const [selectedItem, setSelectedItem] = useState<CollectionPickerItem | null>(
    null,
  );

  const pickerRef = useRef<{
    onFolderSelect: (item: { folder: CollectionPickerItem }) => void;
  }>();

  const handleItemSelect = useCallback(
    (item: CollectionPickerItem) => {
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

  const tabs: [EntityTab] = [
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
