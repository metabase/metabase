import type {
  CollectionContentTableColumn,
  CollectionContentTableColumnsMap,
} from "metabase/collections/components/CollectionContent";
import type { OnToggleSelectedWithItem } from "metabase/collections/types";
import { isRootTrashCollection } from "metabase/collections/utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import { type BreakpointName, breakpoints } from "metabase/ui/theme";
import type { Collection } from "metabase-types/api";

export interface ResponsiveProps {
  /** The element will be hidden when the container's width is below this breakpoint */
  hideAtContainerBreakpoint?: BreakpointName;
  containerName?: string;
}

export const getContainerQuery = (props: ResponsiveProps) =>
  props.hideAtContainerBreakpoint
    ? `@container ${props.containerName || ""} (max-width: ${
        breakpoints[props.hideAtContainerBreakpoint]
      }) { display: none; }`
    : "";

export const getVisibleColumnsMap = (
  visibleColumns: CollectionContentTableColumn[],
) =>
  visibleColumns.reduce((result, item) => {
    result[item] = true;
    return result;
  }, {} as CollectionContentTableColumnsMap);

export const canSelectItems = (
  collection: Collection | undefined,
  onToggleSelected: OnToggleSelectedWithItem | undefined,
): boolean => {
  if (typeof onToggleSelected !== "function") {
    return false;
  }
  if (PLUGIN_LIBRARY.isLibraryCollectionType(collection?.type)) {
    return false;
  }
  return Boolean(collection?.can_write) || isRootTrashCollection(collection);
};
