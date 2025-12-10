import {
  type Dispatch,
  type SetStateAction,
  createContext,
  useContext,
} from "react";

import type {
  EntityPickerOptions,
  OmniPickerCollectionItem,
  OmniPickerFolderItem,
  OmniPickerItem,
} from "./types";

export interface OmniPickerContextValue {
  path: OmniPickerItem[];
  setPath: Dispatch<SetStateAction<OmniPickerItem[]>>;
  onChange: (value: OmniPickerItem) => void;
  initialValue?: OmniPickerItem;
  isFolderItem: (item: OmniPickerItem | unknown) => item is OmniPickerFolderItem;
  isHiddenItem: (item: OmniPickerItem | unknown) => item is unknown;
  isDisabledItem: (item: OmniPickerItem | unknown) => item is OmniPickerItem;
  isSelectableItem: (item: OmniPickerItem | unknown) => item is OmniPickerItem;
  models: OmniPickerItem["model"][];
  searchQuery?: string;
  libraryCollection?: OmniPickerCollectionItem;
  options: EntityPickerOptions;
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
