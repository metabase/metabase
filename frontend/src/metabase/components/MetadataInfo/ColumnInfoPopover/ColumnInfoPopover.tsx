import type { QueryColumnInfoProps, TableColumnInfoProps } from "../ColumnInfo";
import { QueryColumnInfo, TableColumnInfo } from "../ColumnInfo";
import type { PopoverProps } from "../Popover";
import { Popover } from "../Popover";

export type QueryColumnInfoPopoverProps = QueryColumnInfoProps &
  Omit<PopoverProps, "content">;

export function QueryColumnInfoPopover({
  position,
  disabled,
  children,
  openDelay,
  ...rest
}: QueryColumnInfoPopoverProps) {
  return (
    <Popover
      position={position}
      disabled={disabled}
      openDelay={openDelay}
      content={<QueryColumnInfo {...rest} />}
    >
      {children}
    </Popover>
  );
}

export type TableColumnInfoPopoverProps = TableColumnInfoProps &
  Omit<PopoverProps, "content">;

export function TableColumnInfoPopover({
  position,
  disabled,
  openDelay,
  children,
  ...rest
}: TableColumnInfoPopoverProps) {
  return (
    <Popover
      position={position}
      disabled={disabled}
      openDelay={openDelay}
      content={<TableColumnInfo {...rest} />}
    >
      {children}
    </Popover>
  );
}
