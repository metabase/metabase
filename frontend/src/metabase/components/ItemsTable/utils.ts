import type {
  CollectionContentTableColumn,
  CollectionContentTableColumnsMap,
} from "metabase/collections/components/CollectionContent";
import { type BreakpointName, breakpoints } from "metabase/ui/theme";

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
