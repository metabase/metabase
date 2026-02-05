import { useCallback, useEffect, useMemo } from "react";

import { PLUGIN_LIBRARY } from "metabase/plugins";
import { Box, Menu } from "metabase/ui";

import type { DataPickerValue } from "../../../DataPicker";
import { useLogRecentItem } from "../../../EntityPicker/hooks/use-log-recent-item";
import { MiniPickerContext } from "../../context";
import type { MiniPickerItem, MiniPickerPickableItem } from "../../types";
import {
  focusFirstMiniPickerItem,
  getFolderAndHiddenFunctions,
  useGetPathFromValue,
} from "../../utils";
import { MiniPickerListLoader } from "../MiniPickerItemList";
import { MiniPickerPane } from "../MiniPickerPane";

export type MiniPickerProps = {
  searchQuery?: string;
  value?: DataPickerValue;
  opened: boolean;
  trapFocus?: boolean;
  onChange: (value: MiniPickerPickableItem) => void;
  onClose: () => void;
  models: MiniPickerPickableItem["model"][];
  onBrowseAll?: () => void;
  shouldHide?: (item: MiniPickerItem | unknown) => boolean;
  shouldShowLibrary?: boolean;
};

export function MiniPicker({
  searchQuery,
  value,
  onChange,
  opened,
  onClose,
  models,
  onBrowseAll,
  trapFocus = false,
  shouldHide,
  shouldShowLibrary = true,
}: MiniPickerProps) {
  const { data: libraryCollection } = PLUGIN_LIBRARY.useGetLibraryCollection();

  const [path, setPath, { isLoadingPath }] = useGetPathFromValue({
    value,
    opened,
    libraryCollection,
  });

  const { isFolder, isHidden } = useMemo(() => {
    return getFolderAndHiddenFunctions(models, shouldHide);
  }, [models, shouldHide]);

  useEffect(() => {
    if (trapFocus && path) {
      // any time the path changes, focus the first item
      focusFirstMiniPickerItem();
    }
  }, [path, trapFocus]);

  const { tryLogRecentItem } = useLogRecentItem();

  const handleChange = useCallback(
    async (item: MiniPickerPickableItem) => {
      await onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
  );

  return (
    <MiniPickerContext.Provider
      value={{
        path,
        setPath,
        onChange: handleChange,
        isFolder,
        isHidden,
        searchQuery,
        onBrowseAll,
        models,
        canBrowse: !!onBrowseAll,
        libraryCollection,
        shouldShowLibrary,
      }}
    >
      <Menu
        opened={opened}
        onChange={onClose}
        closeOnItemClick={false}
        clickOutsideEvents={["mousedown", "touchstart"]}
        position="bottom-start"
        // menuItemTabIndex={-1}
        trapFocus={false}
      >
        <Menu.Target>
          <Box />
        </Menu.Target>

        <Menu.Dropdown
          mt="xl"
          ml="-1rem"
          px={0}
          py="sm"
          data-testid="mini-picker"
        >
          {isLoadingPath ? <MiniPickerListLoader /> : <MiniPickerPane />}
        </Menu.Dropdown>
      </Menu>
    </MiniPickerContext.Provider>
  );
}
