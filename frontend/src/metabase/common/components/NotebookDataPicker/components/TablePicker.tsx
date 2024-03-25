import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { t } from "ttag";

import { checkNotNull } from "metabase/lib/types";

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
import { generateKey, isFolder } from "../utilts";

import { NotebookDataItemPickerResolver } from "./NotebookDataItemPickerResolver";
// import { getCollectionIdPath, isFolder } from "./utils";


const defaultOptions: EntityPickerModalOptions = {};

interface Props {
  initialValue: Value | null;
  options?: EntityPickerModalOptions;
  onItemSelect: (item: NotebookDataPickerValueItem) => void;
}

const getFolderPath = (
  path: PathEntry<NotebookDataPickerFolderItem["model"]>,
  folder: NotebookDataPickerItem,
): PathEntry<NotebookDataPickerFolderItem["model"]> => {
  const [root, schemas] = path;

  if (folder.model === "database") {
    return [
      root,
      {
        selectedItem: folder,
        model: "schema",
        query: {
          dbId: folder.id,
        },
      },
    ];
  }

  if (folder.model === "schema") {
    const dbId = (schemas.selectedItem as DatabaseItem).id;

    return [
      root,
      schemas,
      {
        model: "table",
        selectedItem: folder,
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

export const TablePicker = forwardRef(function TablePicker(
  { onItemSelect, initialValue, options = defaultOptions }: Props,
  ref: Ref<unknown>,
) {
  const [path, setPath] = useState<PathEntry[]>([
    {
      model: "database",
      query: { saved: false }, // saved questions are fetched in a separate tab
      selectedItem: null,
    },
  ]);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerItem }) => {
      setPath(path => getFolderPath(path, folder));
    },
    [setPath],
  );

  // Exposing onFolderSelect so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      onFolderSelect,
    }),
    [onFolderSelect],
  );

  return (
    <NestedItemPicker
      generateKey={generateKey}
      isFolder={isFolder}
      itemName={t`table`}
      listResolver={NotebookDataItemPickerResolver}
      options={options}
      path={path}
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
    />
  );
});
