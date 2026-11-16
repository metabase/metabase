import { useCallback, useMemo } from "react";
import _ from "underscore";

import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import {
  MiniPickerContext,
  type MiniPickerContextValue,
  type MiniPickerSearchParams,
} from "../context";
import type { MiniPickerItem, MiniPickerPickableItem } from "../types";
import { getFolderAndHiddenFunctions } from "../utils";

import { MiniPickerItemList } from "./MiniPickerItemList";

type MiniPickerSearchResultsProps = {
  /** Must be non-empty: an empty query would show the picker's root items. */
  searchQuery: string;
  models: MiniPickerPickableItem["model"][];
  onChange: (value: MiniPickerPickableItem) => void;
  shouldHide?: (item: MiniPickerItem | unknown) => boolean;
  searchParams?: MiniPickerSearchParams;
};

/**
 * The mini picker's search results (debounced search, loader, empty state,
 * location column) for a menu that brings its own search box and browse list.
 * Must render inside a `Menu.Dropdown`.
 */
export function MiniPickerSearchResults({
  searchQuery,
  models,
  onChange,
  shouldHide,
  searchParams,
}: MiniPickerSearchResultsProps) {
  const { isFolder, isHidden } = useMemo(
    () => getFolderAndHiddenFunctions(models, shouldHide),
    [models, shouldHide],
  );
  const { tryLogRecentItem } = useLogRecentItem();

  const handleChange = useCallback(
    async (item: MiniPickerPickableItem) => {
      await onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
  );

  const context = useMemo<MiniPickerContextValue>(
    () => ({
      path: [],
      setPath: _.noop,
      onChange: handleChange,
      isFolder,
      isHidden,
      models,
      searchQuery,
      canBrowse: false,
      searchParams,
    }),
    [handleChange, isFolder, isHidden, models, searchQuery, searchParams],
  );

  return (
    <MiniPickerContext.Provider value={context}>
      <MiniPickerItemList />
    </MiniPickerContext.Provider>
  );
}
