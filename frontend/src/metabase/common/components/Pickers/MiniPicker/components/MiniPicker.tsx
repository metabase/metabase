import { useEffect, useMemo } from "react";

import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Menu } from "metabase/ui";

import type { DataPickerValue } from "../../DataPicker";
import { MiniPickerContext } from "../context";
import type {
  MiniPickerFolderItem,
  MiniPickerItem,
  MiniPickerPickableItem,
} from "../types";
import { useGetPathFromValue } from "../utils";

import { MiniPickerListLoader } from "./MiniPickerItemList";
import { MiniPickerPane } from "./MiniPickerPane";

type MiniPickerProps = {
  searchQuery?: string;
  clearSearchQuery: () => void;
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
  clearSearchQuery,
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
    const modelSet = new Set(models);
    const isFolder = (
      item: MiniPickerItem | unknown,
    ): item is MiniPickerFolderItem => {
      if (!item || typeof item !== "object" || !("model" in item)) {
        return false;
      }

      if (!("here" in item) && !("below" in item)) {
        return false;
      }

      const hereBelowSet = Array.from(
        new Set([
          ...("here" in item && Array.isArray(item.here) ? item.here : []),
          ...("below" in item && Array.isArray(item.below) ? item.below : []),
        ]),
      );
      return (
        item.model === "collection" &&
        hereBelowSet.some((hereBelowModel) => modelSet.has(hereBelowModel))
      );
    };

    const isHidden = (item: MiniPickerItem | unknown): item is unknown => {
      if (!item || typeof item !== "object" || !("model" in item)) {
        return false;
      }

      return !modelSet.has(item.model as any) && !isFolder(item);
    };
    return { isFolder, isHidden };
  }, [models]);

  useEffect(() => {
    if (trapFocus && path) {
      // any time the path changes, focus the first item
      const firstItem = document.querySelector(
        '[data-testid="mini-picker"] [role="menuitem"]',
      );
      if (firstItem) {
        (firstItem as HTMLElement).focus();
      }
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
        clearSearchQuery,
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
        menuItemTabIndex={-1}
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
