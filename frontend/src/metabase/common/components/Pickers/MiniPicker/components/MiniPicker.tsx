import { useEffect, useMemo } from "react";

import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Menu } from "metabase/ui";

import type { DataPickerValue } from "../../DataPicker";
import { MiniPickerContext } from "../context";
import type { MiniPickerPickableItem } from "../types";
import {
  focusFirstMiniPickerItem,
  getFolderAndHiddenFunctions,
  useGetPathFromValue,
} from "../utils";

import { MiniPickerListLoader } from "./MiniPickerItemList";
import { MiniPickerPane } from "./MiniPickerPane";

export type MiniPickerProps = {
  searchQuery?: string;
  value?: DataPickerValue;
  opened: boolean;
  trapFocus?: boolean;
  onChange: (value: MiniPickerPickableItem) => void;
  onClose: () => void;
  models: MiniPickerPickableItem["model"][];
  onBrowseAll?: () => void;
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
}: MiniPickerProps) {
  const { data: libraryCollection } =
    PLUGIN_DATA_STUDIO.useGetLibraryCollection();

  const [path, setPath, { isLoadingPath }] = useGetPathFromValue({
    value,
    opened,
    libraryCollection,
  });

  const { isFolder, isHidden } = useMemo(() => {
    return getFolderAndHiddenFunctions(models);
  }, [models]);

  useEffect(() => {
    if (trapFocus && path) {
      // any time the path changes, focus the first item
      focusFirstMiniPickerItem();
    }
  }, [path, trapFocus]);

  return (
    <MiniPickerContext.Provider
      value={{
        path,
        setPath,
        onChange,
        isFolder,
        isHidden,
        searchQuery,
        onBrowseAll,
        models,
        canBrowse: !!onBrowseAll,
        libraryCollection,
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
