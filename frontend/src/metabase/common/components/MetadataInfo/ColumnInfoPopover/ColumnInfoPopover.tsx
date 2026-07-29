import type { PopoverProps } from "../Popover";
import { Popover } from "../Popover";
import type { QueryColumnInfoProps } from "../QueryColumnInfo";
import { QueryColumnInfo } from "../QueryColumnInfo";

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
