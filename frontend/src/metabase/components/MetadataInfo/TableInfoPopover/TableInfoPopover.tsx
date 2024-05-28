import { isVirtualCardId } from "metabase-lib/v1/metadata/utils/saved-questions";

import type { PopoverProps } from "../Popover";
import { Popover } from "../Popover";
import type { TableInfoProps } from "../TableInfo";
import TableInfo from "../TableInfo";

export type TableInfoPopoverProps = Omit<PopoverProps, "content"> &
  Omit<TableInfoProps, "tableId"> & {
    table: {
      id: string | number;
      description?: string | null;
    };
  };

export function TableInfoPopover({
  children,
  delay,
  disabled,
  position,
  table,
  ...rest
}: TableInfoPopoverProps) {
  const shouldHavePopover = table.description && !isVirtualCardId(table.id);

  if (!shouldHavePopover) {
    return null;
  }

  return (
    <Popover
      position={position}
      delay={delay}
      disabled={disabled}
      content={<TableInfo tableId={table.id} {...rest} />}
    >
      {children}
    </Popover>
  );
}
