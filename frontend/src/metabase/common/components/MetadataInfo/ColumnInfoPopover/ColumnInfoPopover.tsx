import type { QueryColumnInfoProps } from "../ColumnInfo";
import { QueryColumnInfo } from "../ColumnInfo";
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
