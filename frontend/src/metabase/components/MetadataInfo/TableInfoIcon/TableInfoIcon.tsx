import { t } from "ttag";

import { PopoverHoverTarget, HoverParent } from "../InfoIcon";
import type { TableInfoPopoverProps } from "../TableInfoPopover";
import { TableInfoPopover } from "../TableInfoPopover";
export { HoverParent };

type TableInfoIconProps = TableInfoPopoverProps & {
  className?: string;
};

export function TableInfoIcon({
  className,
  delay,
  table,
  ...props
}: TableInfoIconProps) {
  return (
    <TableInfoPopover {...props} table={table} delay={delay}>
      <PopoverHoverTarget
        className={className}
        name="info_filled"
        hasDescription={Boolean(table.description)}
        aria-label={t`More info`}
      />
    </TableInfoPopover>
  );
}
