import { type Ref, useCallback, useEffect, useMemo } from "react";

import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { MenuDropdownProps } from "metabase/ui";
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
  children?: React.ReactNode;
  menuDropdownProps?: MenuDropdownProps;
  closeOnClickOutside?: boolean;
  menuDropdownRef?: Ref<HTMLDivElement>;
  isCompact?: boolean;
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
  children = <Box />,
  menuDropdownProps,
  closeOnClickOutside = true,
  isCompact,
  menuDropdownRef,
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
        isCompact,
      }}
    >
      <Menu
        opened={opened}
        onChange={onClose}
        closeOnItemClick={false}
        clickOutsideEvents={["mousedown", "touchstart"]}
        closeOnClickOutside={closeOnClickOutside}
        position="bottom-start"
        // menuItemTabIndex={-1}
        trapFocus={false}
      >
        <Menu.Target>{children}</Menu.Target>

        <Menu.Dropdown
          px={0}
          py="sm"
          data-testid="mini-picker"
          {...menuDropdownProps}
          ref={menuDropdownRef}
        >
          {isLoadingPath ? <MiniPickerListLoader /> : <MiniPickerPane />}
        </Menu.Dropdown>
      </Menu>
    </MiniPickerContext.Provider>
  );
}
