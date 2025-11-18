import { useMemo, useState } from "react";

import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Box, Popover } from "metabase/ui";

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
  onChange: (value: MiniPickerPickableItem) => void;
  onClose: () => void;
  models: MiniPickerPickableItem["model"][];
  browseAllComponent?: React.ReactNode;
};

export function MiniPicker({
  searchQuery,
  value,
  onChange,
  opened,
  onClose,
  models,
  clearSearchQuery,
  browseAllComponent,
}: MiniPickerProps) {
  const [shouldBrowse, setShouldBrowse] = useState(false);
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
        setShouldBrowse,
        models,
        canBrowse: !!browseAllComponent,
        libraryCollection,
      }}
    >
      {shouldBrowse ? (
        browseAllComponent
      ) : (
        <Popover opened={opened} onChange={onClose} position="bottom-start">
          <Popover.Target>
            <Box />
          </Popover.Target>

          <Popover.Dropdown
            mt="xl"
            ml="-1rem"
            py="sm"
            data-testid="mini-picker"
          >
            {isLoadingPath ? <MiniPickerListLoader /> : <MiniPickerPane />}
          </Popover.Dropdown>
        </Popover>
      )}
    </MiniPickerContext.Provider>
  );
}
