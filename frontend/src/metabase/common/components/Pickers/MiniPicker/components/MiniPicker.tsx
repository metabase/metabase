import { useEffect, useMemo, useState } from "react";

import { Popover } from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import { MiniPickerContext } from "../context";
import type { MiniPickerFolderItem, MiniPickerItem } from "../types";

import { MiniPickerPane } from "./MiniPickerPane";

type MiniPickerProps = {
  searchQuery?: string;
  clearSearchQuery: () => void;
  value?: unknown;
  onChange: (value: unknown) => void;
  onClose: () => void;
  models: SearchModel[];
  browseAllComponent?: React.ReactNode;
};

export function MiniPicker({
  searchQuery, value, onChange, onClose, models, clearSearchQuery, browseAllComponent
}: MiniPickerProps) {
  const [path, setPath] = useState<MiniPickerFolderItem[]>([]);
  const [shouldBrowse, setShouldBrowse] = useState(false);

  useEffect(() => {
    // TODO: get initial path based on value
  }, [value]);

  const { isFolder, isHidden } = useMemo(() => {
    const modelSet = new Set(models);
    const isFolder = (item: MiniPickerItem | unknown) => {
      const hereBelowSet = Array.from(new Set([
        ...(item?.here ?? []),
        ...(item?.below ?? []),
      ]));
      return item.model === "collection" &&
        (
          hereBelowSet.some((i: SearchModel) => modelSet.has(i.model))
        );
    };

    const isHidden = (item: MiniPickerItem | unknown) => {
      return "model" in item && !modelSet.has(item.model) && !isFolder(item);
    };
    return { isFolder, isHidden };
  }, [models]);

  return (
    <MiniPickerContext.Provider value={{
      path,
      setPath,
      onChange,
      isFolder,
      isHidden,
      searchQuery,
      clearSearchQuery,
      setShouldBrowse,
      canBrowse: !!browseAllComponent,
    }}>
      {shouldBrowse
        ? browseAllComponent
      :
        <Popover
          onClose={onClose}
          closeOnClickOutside
          closeOnEscape
          opened
          position="bottom-start"
        >
          <Popover.Target>
            <div />
          </Popover.Target>

          <Popover.Dropdown p="md" mt="md">
            <MiniPickerPane />
          </Popover.Dropdown>
        </Popover>
      }
    </MiniPickerContext.Provider>
  );
}
