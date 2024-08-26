import type { QueryColumnInfoProps, TableColumnInfoProps } from "../ColumnInfo";
import { QueryColumnInfo, TableColumnInfo } from "../ColumnInfo";
import type { PopoverProps } from "../Popover";
import { Popover } from "../Popover";

export type QueryColumnInfoPopoverProps = QueryColumnInfoProps &
  Omit<PopoverProps, "content">;

export function QueryColumnInfoPopover({
  position,
  delay,
  disabled,
  children,
  ...rest
}: QueryColumnInfoPopoverProps) {
  return (
    <Popover
      position={position}
      delay={delay}
      disabled={disabled}
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
  delay,
  disabled,
  children,
  ...rest
}: TableColumnInfoPopoverProps) {
  return (
    <Popover
      position={position}
      delay={delay}
      disabled={disabled}
      content={<TableColumnInfo {...rest} />}
    >
      {children}
    </Popover>
  );
}
