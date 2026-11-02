import type {
  CollectionContentTableColumn,
  CollectionContentTableColumnsMap,
} from "metabase/common/collections/columns";
import type {
  OnToggleSelected,
  OnToggleSelectedWithItem,
} from "metabase/common/collections/types";
import { isRootTrashCollection } from "metabase/common/collections/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { BreakpointName } from "metabase/ui/theme";
import type { Collection } from "metabase-types/api";

export type ContainerBreakpointName = Extract<
  BreakpointName,
  "xs" | "sm" | "md"
>;

export interface ResponsiveProps {
  /** The element will be hidden when the container's width is below this breakpoint */
  hideAtContainerBreakpoint?: ContainerBreakpointName;
}

export const getVisibleColumnsMap = (
  visibleColumns: CollectionContentTableColumn[],
) =>
  visibleColumns.reduce((result, item) => {
    result[item] = true;
    return result;
    // Unjustified type cast. FIXME
  }, {} as CollectionContentTableColumnsMap);

export const canSelectItems = (
  collection: Collection | undefined,
  onToggleSelected: OnToggleSelected | OnToggleSelectedWithItem | undefined,
): boolean => {
  if (typeof onToggleSelected !== "function") {
    return false;
  }
  if (PLUGIN_LIBRARY.isLibraryCollectionType(collection?.type)) {
    return false;
  }
  return Boolean(collection?.can_write) || isRootTrashCollection(collection);
};
