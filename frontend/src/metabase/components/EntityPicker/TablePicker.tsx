import { useState, useEffect } from "react";

import type { Collection } from "metabase-types/api";
import type Question from "metabase-lib/Question";

import { EntityPicker } from "./EntityPicker";


interface TablePickerProps {
  onItemSelect: (item: Question) => void;
  initialTableId?: number
}


export function TablePicker({ onItemSelect, initialTableId}: TablePickerProps) {
  const [ initialState, setInitialState ] = useState<any>();

  const onFolderSelect = async (folder: Collection) => {
    return [];
  }

  useEffect(() => {
    if(initialTableId) {
      setInitialState([]);
    } else {
      setInitialState([]);
    }
  }, [initialTableId]);

  if (!initialState) {
    return null;
  }

  return (
    <EntityPicker
      itemModel="table"
      folderModel="database | schema"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  )
}
