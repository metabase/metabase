import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetTableQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

import type { EntityPickerModalOptions, EntityTab } from "../../EntityPicker";
import { EntityPickerModal, defaultOptions } from "../../EntityPicker";
import type { NotebookDataPickerValueItem, TablePickerValue } from "../types";
import { isTablePickerValueEqual, tablePickerValueFromTable } from "../utils";

import { TablePicker } from "./TablePicker";

interface Props {
  /**
   * TODO: use this prop in https://github.com/metabase/metabase/issues/40719
   */
  collectionId: CollectionId | null | undefined;
  value: TablePickerValue | null;
  onChange: (value: TablePickerValue) => void;
  onClose: () => void;
}

const options: EntityPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
};

export const DataPickerModal = ({ value, onChange, onClose }: Props) => {
  const [selectedItem, setSelectedItem] =
    useState<NotebookDataPickerValueItem | null>(null);
  const [valueId, setValueId] = useState<
    NotebookDataPickerValueItem["id"] | undefined
  >(value?.id);

  const shouldFetchNewMetadata = valueId != null && valueId !== value?.id;
  const { data: table } = useGetTableQuery(
    shouldFetchNewMetadata ? { id: valueId } : skipToken,
  );

  useEffect(() => {
    if (table) {
      const valueFromTable = tablePickerValueFromTable(table);

      if (!isTablePickerValueEqual(value, valueFromTable)) {
        onChange(valueFromTable);
        onClose();
      }
    }
  }, [table, value, onChange, onClose]);

  const handleItemSelect = useCallback((item: NotebookDataPickerValueItem) => {
    setValueId(item.id);
    setSelectedItem(item);
  }, []);

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
      selectedItem={selectedItem}
      tabs={tabs}
      title={t`Pick your starting data`}
      onClose={onClose}
      onConfirm={_.noop} // TODO allow undefined
      onItemSelect={handleItemSelect}
    />
  );
};
