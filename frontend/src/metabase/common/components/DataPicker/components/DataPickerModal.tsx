import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { CollectionId, TableId } from "metabase-types/api";

import type { EntityPickerModalOptions, EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type { NotebookDataPickerValueItem, TablePickerValue } from "../types";

import { TablePicker } from "./TablePicker";

interface Props {
  /**
   * TODO: use this prop in https://github.com/metabase/metabase/issues/40719
   */
  collectionId: CollectionId | null | undefined;
  value: TablePickerValue | null;
  onChange: (value: TableId) => void;
  onClose: () => void;
}

const options: EntityPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
};

export const DataPickerModal = ({ value, onChange, onClose }: Props) => {
  const handleItemSelect = useCallback(
    (item: NotebookDataPickerValueItem) => {
      onChange(item.id);
      onClose();
    },
    [onChange, onClose],
  );

  const tabs: [
    EntityTab<NotebookDataPickerValueItem["model"]>,
    ...EntityTab<NotebookDataPickerValueItem["model"]>[],
  ] = [
    {
      displayName: t`Tables`,
      model: "table",
      icon: "table",
      element: <TablePicker value={value} onItemSelect={handleItemSelect} />,
    },
  ];

  return (
    <EntityPickerModal
      canSelectItem
      options={options}
      selectedItem={null}
      tabs={tabs}
      title={t`Pick your starting data`}
      onClose={onClose}
      onConfirm={_.noop} // onConfirm is unused when options.hasConfirmButtons is falsy
      onItemSelect={handleItemSelect}
    />
  );
};
