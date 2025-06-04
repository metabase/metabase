import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import type { IconName } from "metabase/ui";

import type {
  QueryColumnInfoPopoverProps,
  TableColumnInfoPopoverProps,
} from "../ColumnInfoPopover";
import {
  QueryColumnInfoPopover,
  TableColumnInfoPopover,
} from "../ColumnInfoPopover";
import {
  HoverParent,
  PopoverDefaultIcon,
  PopoverHoverTarget,
} from "../InfoIcon";
export { HoverParent };

type QueryColumnInfoIconProps = QueryColumnInfoPopoverProps & {
  size?: number;
  icon?: IconName;
  color?: string;
};

export function QueryColumnInfoIcon({
  className,
  size,
  icon,
  color,
  ...props
}: QueryColumnInfoIconProps) {
  const { column } = props;

  return (
    <>
      <QueryColumnInfoPopover {...props}>
        <span aria-label={t`More info`}>
          <PopoverDefaultIcon
            className={className}
            name={icon ?? getColumnIcon(column)}
            size={size}
            color={color}
          />
          <PopoverHoverTarget
            className={className}
            name="info_filled"
            size={size}
          />
        </span>
      </QueryColumnInfoPopover>
    </>
  );
}

QueryColumnInfoIcon.HoverParent = HoverParent;

type TableColumnInfoIconProps = TableColumnInfoPopoverProps & {
  icon: IconName;
  size?: number;
  color?: string;
};

export function TableColumnInfoIcon({
  className,
  field,
  icon,
  size,
  color,
  ...props
}: TableColumnInfoIconProps) {
  return (
    <TableColumnInfoPopover {...props} field={field}>
      <span aria-label={t`More info`}>
        <PopoverDefaultIcon
          className={className}
          name={icon}
          size={size}
          color={color}
        />
        <PopoverHoverTarget
          className={className}
          name="info_filled"
          size={size}
        />
      </span>
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.HoverParent = HoverParent;
