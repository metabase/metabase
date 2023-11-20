import { useState, useEffect } from "react";

import { EntityPicker } from "./EntityPicker";

interface TestThing {
  id: number;
  name: string;
  model: string;
}

interface TestPickerProps {
  onItemSelect: (item: TestThing) => void;
  initialFolderId?: number
}

const rootFolder = [
  { id: 1, name: "folder1", model: "folder" },
  { id: 2, name: "folder2", model: "folder" },
  { id: 3, name: "test folder", model: "folder" },
  { id: 4, name: "test q", model: "item" },
  { id: 5, name: "best pokemon", model: "item" },
];

const childrenOf1 = [
  { id: 6, name: "folder1-1", model: "folder" },
  { id: 7, name: "folder1-2", model: "folder" },
  { id: 8, name: "test q", model: "item" },
];

const childrenOf2 = [
  { id: 9, name: "folder2-1", model: "folder" },
  { id: 10, name: "folder2-2", model: "folder" },
  { id: 11, name: "test q 2", model: "item" },
];

export function TestPicker({ onItemSelect, initialFolderId }: TestPickerProps) {
  const [ initialState, setInitialState ] = useState<any>();

  const onFolderSelect = (folder: TestThing) => {
    if (folder.id === 1) {
      return childrenOf1;
    } else if (folder.id === 2) {
      return childrenOf2;
    }
    return rootFolder;
  };

  useEffect(() => {
    if (initialFolderId) {
      if (initialFolderId === 1) {
        setInitialState([
          { items: rootFolder, selectedId: 1 },
          { items: childrenOf2, selectedId: null },
        ]);
      } else if (initialFolderId === 2) {
        setInitialState([
          { items: rootFolder, selectedId: 2 },
          { items: childrenOf2, selectedId: null },
        ]);
      } else {
        setInitialState([]);
      }
    } else {
      setInitialState([]);
    }
  }, [initialFolderId]);

  if (!initialState) {
    return null;
  }

  return (
    <EntityPicker
      itemModel="item"
      folderModel="folder"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  )
}
