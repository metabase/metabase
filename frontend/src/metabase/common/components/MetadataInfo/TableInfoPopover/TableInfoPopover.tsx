import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";

import type { PopoverProps } from "../Popover";
import { Popover } from "../Popover";
import type { TableInfoProps } from "../TableInfo";
import { TableInfo } from "../TableInfo";

export type TableInfoPopoverProps = Omit<PopoverProps, "content"> &
  Omit<TableInfoProps, "tableId"> & {
    table: {
      id: string | number;
      description?: string | null;
    };
  };

/** Whether `TableInfoPopover` renders for this table. When it doesn't, its children aren't rendered either. */
export function hasTableInfoPopover(table: TableInfoPopoverProps["table"]) {
  return Boolean(table.description) && !isVirtualCardId(table.id);
}

export function TableInfoPopover({
  children,
  disabled,
  position,
  openDelay,
  table,
  ...rest
}: TableInfoPopoverProps) {
  if (!hasTableInfoPopover(table)) {
    return null;
  }

  return (
    <Popover
      position={position}
      disabled={disabled}
      openDelay={openDelay}
      content={<TableInfo tableId={table.id} {...rest} />}
    >
      {children}
    </Popover>
  );
}
