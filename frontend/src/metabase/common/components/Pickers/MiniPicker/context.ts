import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useContext,
} from "react";

import type { SearchRequest } from "metabase-types/api";

import type {
  MiniPickerCollectionItem,
  MiniPickerFolderItem,
  MiniPickerItem,
  MiniPickerPickableItem,
} from "./types";

export type MiniPickerSearchParams =
  | Partial<SearchRequest>
  | ((params: SearchRequest) => Partial<SearchRequest>);

export interface MiniPickerContextValue {
  path: MiniPickerFolderItem[];
  setPath: Dispatch<SetStateAction<MiniPickerFolderItem[]>>;
  onChange: (value: MiniPickerPickableItem) => void;
  initialValue?: unknown;
  isFolder: (item: MiniPickerItem | unknown) => item is MiniPickerFolderItem;
  isHidden: (item: MiniPickerItem | unknown) => item is unknown;
  models: MiniPickerPickableItem["model"][];
  searchQuery?: string;
  canBrowse: boolean;
  onBrowseAll?: () => void;
  libraryCollection?: MiniPickerCollectionItem;
  shouldShowLibrary?: boolean;
  forceSearch?: boolean;
  showSearchInput?: boolean;
  searchInputPlaceholder?: string;
  searchParams?: MiniPickerSearchParams;
  onSearchResults?: (results: MiniPickerPickableItem[]) => void;
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
