import { useMiniPickerContext } from "../../Pickers/MiniPicker/context";
import { VirtualizedList } from "../../VirtualizedList";
import { isInDbTree } from "../types";

import { CollectionItemList } from "./CollectionItemList";
import { DbItemList } from "./DbItemList";


export function ItemList({ pathIndex }: { pathIndex: number }) {
  const { path } = useMiniPickerContext();
  const parent = path[pathIndex];

  const showDbTree = isInDbTree(parent);

  if (showDbTree) {
    return (
      <ItemListWrapper>
        <DbItemList parent={parent} />
      </ItemListWrapper>
    );
  }

  return (
    <ItemListWrapper>
      <CollectionItemList parent={parent} />
    </ItemListWrapper>
  );
}

function ItemListWrapper({ children }: { children: React.ReactNode[] }) {
  return <VirtualizedList>{children}</VirtualizedList>;
}
