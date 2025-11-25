import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useContext,
} from "react";

import type {
  OmniPickerCollectionItem,
  OmniPickerFolderItem,
  OmniPickerItem,
  OmniPickerPickableItem,
} from "./types";

export interface OmniPickerContextValue {
  path: OmniPickerFolderItem[];
  setPath: Dispatch<SetStateAction<OmniPickerFolderItem[]>>;
  onChange: (value: OmniPickerPickableItem) => void;
  initialValue?: OmniPickerItem;
  isFolderItem: (item: OmniPickerItem | unknown) => item is OmniPickerFolderItem;
  isHiddenItem: (item: OmniPickerItem | unknown) => item is unknown;
  isDisabledItem: (item: OmniPickerItem | unknown) => item is OmniPickerItem;
  models: OmniPickerPickableItem["model"][];
  searchQuery?: string;
  libraryCollection?: OmniPickerCollectionItem;
}

export const OmniPickerContext = createContext<
  OmniPickerContextValue | undefined
>(undefined);

export const useOmniPickerContext = () => {
  const context = useContext(OmniPickerContext);

  if (!context) {
    throw new Error(
      "useOmniPickerContext must be used within a OmniPickerProvider",
    );
  }
  return context;
};
