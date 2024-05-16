import { t } from "ttag";

import type { IconName } from "metabase/ui";

import {
  PopoverHoverTarget,
  HoverParent,
  PopoverDefaultIcon,
} from "../InfoIcon";
import type { TableInfoPopoverProps } from "../TableInfoPopover";
import { TableInfoPopover } from "../TableInfoPopover";
export { HoverParent };

type TableInfoIconProps = TableInfoPopoverProps & {
  className?: string;
  icon?: IconName;
  size?: number;
};

export function TableInfoIcon({
  className,
  delay,
  table,
  size,
  icon = "table",
  ...props
}: TableInfoIconProps) {
  return (
    <TableInfoPopover {...props} table={table} delay={delay}>
      <span aria-label={t`More info`}>
        <PopoverDefaultIcon name={icon} className={className} size={size} />
        <PopoverHoverTarget
          className={className}
          name="info_filled"
          hasDescription={Boolean(table.description)}
          size={size}
        />
      </span>
    </TableInfoPopover>
  );
}
