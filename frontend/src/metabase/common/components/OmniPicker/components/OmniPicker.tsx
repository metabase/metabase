import { useState } from "react";

import { Flex } from "metabase/ui";

import { AutoScrollBox } from "../../EntityPicker";
import { OmniPickerContext, type OmniPickerContextValue } from "../context";
import type { OmniPickerFolderItem, OmniPickerItem } from "../types";

import { ItemListRouter } from "./ItemList/ItemListRouter";
import { RootItemList } from "./ItemList/RootItemList";

export type OmniPickerProps = {
  value?: OmniPickerItem;
} & Omit<OmniPickerContextValue, "path" | "setPath" | "initialValue">;

export function OmniPicker(props: OmniPickerProps) {
  const [path, setPath] = useState<OmniPickerFolderItem[]>([]);

  return (
    <OmniPickerContext.Provider value={{
      ...props,
      initialValue: props.value,
      path,
      setPath,
    }}>
      <AutoScrollBox contentHash={JSON.stringify(path)}>
        <Flex h="100%" w="fit-content">
          <RootItemList />
          {path.map((_, index) => (
            <ItemListRouter key={index} pathIndex={index} />
          ))}
        </Flex>
      </AutoScrollBox>
      <pre>{JSON.stringify(path, null, 2)}</pre>
    </OmniPickerContext.Provider>
  );
}
