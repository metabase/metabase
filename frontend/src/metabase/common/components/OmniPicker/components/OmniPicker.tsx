import { useState } from "react";

import { Box } from "metabase/ui";

import { AutoScrollBox } from "../../EntityPicker";
import { OmniPickerContext, type OmniPickerContextValue } from "../context";
import type { OmniPickerFolderItem, OmniPickerItem } from "../types";

import { ItemList } from "./ItemList";
import { RootItemList } from "./RootItemList";

export type OmniPickerProps = {
  value?: OmniPickerItem;
} & Omit<OmniPickerContextValue, "path" | "setPath" | "initialValue">;

export function OmniPicker(props: OmniPickerProps) {
  const [path, setPath] = useState<OmniPickerFolderItem[]>([]);

  return (
    <Box>
      <OmniPickerContext.Provider value={{
        ...props,
        initialValue: props.value,
        path,
        setPath,
      }}>
        <AutoScrollBox contentHash={JSON.stringify(path)}>
          <RootItemList />
          {path.map((_, index) => (
            <ItemList key={index} pathIndex={index} />
          ))}
        </AutoScrollBox>
      </OmniPickerContext.Provider>
    </Box>
  );
}
