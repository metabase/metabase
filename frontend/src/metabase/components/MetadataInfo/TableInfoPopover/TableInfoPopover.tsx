import { isVirtualCardId } from "metabase-lib/metadata/utils/saved-questions";

import type { PopoverProps } from "../Popover";
import { Popover } from "../Popover";
import TableInfo from "../TableInfo";

export type TableInfoPopoverProps = Omit<PopoverProps, "content"> & {
  table: {
    id: string | number;
    description?: string;
  };
};

export function TableInfoPopover({
  children,
  delay,
  disabled,
  position,
  table,
}: TableInfoPopoverProps) {
  const shouldHavePopover = table.description && !isVirtualCardId(table.id);

  if (!shouldHavePopover) {
    return <>children</>;
  }

  return (
    <Popover
      position={position}
      delay={delay}
      disabled={disabled}
      content={<TableInfo tableId={table.id} />}
    >
      {children}
    </Popover>
  );
}
