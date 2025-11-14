import { createContext, useContext, useMemo, useState } from "react";

import type { SearchModel } from "metabase-types/api";

import type {
  MiniPickerFolderItem,
  MiniPickerItem,
  MiniPickerPickableItem,
} from "./types";

interface MiniPickerContextValue {
  path: MiniPickerFolderItem[];
  setPath: (path: MiniPickerFolderItem[]) => void;
  onChange: (value: MiniPickerPickableItem) => void;
  initialValue?: unknown;
  isFolder: (item: MiniPickerItem | unknown) => boolean;
  isHidden: (item: MiniPickerItem | unknown) => boolean;
  searchQuery?: string;
  clearSearchQuery: () => void;
  canBrowse: boolean;
  setShouldBrowse: (shouldBrowse: boolean) => void;
}

export const MiniPickerContext = createContext<
  MiniPickerContextValue | undefined
>(undefined);

export const useMiniPickerContext = () => {
  const context = useContext(MiniPickerContext);

  if (!context) {
    throw new Error(
      "useMiniPickerContext must be used within a MiniPickerProvider",
    );
  }
  return context;
};
