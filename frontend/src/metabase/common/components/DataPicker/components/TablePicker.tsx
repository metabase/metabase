import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { t } from "ttag";

import {
  NestedItemPicker,
  type EntityPickerModalOptions,
} from "../../EntityPicker";
import type {
  DatabaseItem,
  NotebookDataPickerItem,
  NotebookDataPickerValueItem,
  PathEntry,
  Value,
} from "../types";
import { generateKey, isFolder } from "../utils";

import { DataPickerListResolver } from "./DataPickerListResolver";
// import { getCollectionIdPath, isFolder } from "./utils";

const defaultOptions: EntityPickerModalOptions = {};

interface Props {
  value: Value | null;
  options?: EntityPickerModalOptions;
  onItemSelect: (item: NotebookDataPickerValueItem) => void;
}

const getFolderPath = (
  path: PathEntry<NotebookDataPickerFolderItem["model"]>,
  folder: NotebookDataPickerItem,
  value: Value | null,
): PathEntry<NotebookDataPickerFolderItem["model"]> => {
  const [database, schema] = path;

  if (folder.model === "database") {
    return [
      {
        ...database,
        selectedItem: folder,
      },
      {
        selectedItem: null,
        model: "schema",
        query: {
          dbId: folder.id,
        },
      },
    ];
  }

  if (folder.model === "schema") {
    const dbId = (database.selectedItem as DatabaseItem).id;

    return [
      database,
      {
        ...schema,
        selectedItem: folder,
      },
      {
        model: "table",
        selectedItem: value,
        query: {
          dbId,
        },
      },
    ];
  }

  if (
    folder.model === "card" ||
    folder.model === "dataset" ||
    folder.model === "table" ||
    folder.model === "collection"
  ) {
    throw new Error("Not implemented"); // TODO typing
  }
};

const getInitialPath = (value: Value | null) => [
  {
    model: "database",
    query: { saved: false },
    selectedItem: value,
  },
];

export const TablePicker = forwardRef(function TablePicker(
  { onItemSelect, value, options = defaultOptions }: Props,
  ref: Ref<unknown>,
) {
  const [path, setPath] = useState<PathEntry[]>(getInitialPath(value));

  const handleFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerItem }) => {
      setPath(path => getFolderPath(path, folder, value));
    },
    [setPath, value],
  );

  const handleItemSelect = useCallback(
    (item: NotebookDataPickerItem) => {
      setPath(path => {
        const [database, schema, table] = path;
        return [database, schema, { ...table, selectedItem: item }];
      });
      onItemSelect(item);
    },
    [setPath, onItemSelect],
  );

  // Exposing handleFolderSelect so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      handleFolderSelect,
    }),
    [handleFolderSelect],
  );

  return (
    <NestedItemPicker
      generateKey={generateKey}
      isFolder={isFolder}
      itemName={t`table`}
      listResolver={DataPickerListResolver}
      options={options}
      path={path}
      onFolderSelect={handleFolderSelect}
      onItemSelect={handleItemSelect}
    />
  );
});
