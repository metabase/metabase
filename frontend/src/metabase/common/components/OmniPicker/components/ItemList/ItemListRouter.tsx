import { useOmniPickerContext } from "../../context";
import { isInDbTree } from "../../types";

import { CollectionItemList } from "./CollectionItemList";
import { DbItemList } from "./DbItemList";

export function ItemListRouter({ pathIndex }: { pathIndex: number }) {
  const { path } = useOmniPickerContext();
  const parent = path[pathIndex];

  const showDbTree = isInDbTree(parent);

  if (showDbTree) {
    return (
      <DbItemList parent={parent} />
    );
  }

  return (
    <CollectionItemList
      parent={parent}
      pathIndex={pathIndex}
    />
  );
}
