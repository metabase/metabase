import { t } from "ttag";

import type { IconName } from "metabase/ui";

import {
  HoverParent,
  PopoverDefaultIcon,
  PopoverHoverTarget,
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
  table,
  size,
  icon = "table",
  ...props
}: TableInfoIconProps) {
  return (
    <TableInfoPopover {...props} table={table}>
      <span aria-label={t`More info`}>
        <PopoverDefaultIcon name={icon} className={className} size={size} />
        <PopoverHoverTarget
          className={className}
          name="info_filled"
          size={size}
        />
      </span>
    </TableInfoPopover>
  );
}
