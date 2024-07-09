import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";

import type {
  QueryColumnInfoPopoverProps,
  TableColumnInfoPopoverProps,
} from "../ColumnInfoPopover";
import {
  QueryColumnInfoPopover,
  TableColumnInfoPopover,
} from "../ColumnInfoPopover";
import {
  PopoverHoverTarget,
  PopoverDefaultIcon,
  HoverParent,
} from "../InfoIcon";
export { HoverParent };

type QueryColumnInfoIconProps = QueryColumnInfoPopoverProps & {
  size?: number;
  icon?: IconName;
  color?: string;
};

export function QueryColumnInfoIcon({
  className,
  delay,
  size,
  icon,
  color,
  ...props
}: QueryColumnInfoIconProps) {
  const { query, stageIndex, column } = props;
  const { description = "" } = query
    ? Lib.displayInfo(query, stageIndex, column)
    : {};

  return (
    <>
      <QueryColumnInfoPopover {...props} delay={delay}>
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
            hasDescription={Boolean(description)}
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
  delay,
  field,
  icon,
  size,
  color,
  ...props
}: TableColumnInfoIconProps) {
  return (
    <TableColumnInfoPopover {...props} field={field} delay={delay}>
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
          hasDescription={Boolean(field.description)}
          size={size}
        />
      </span>
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.HoverParent = HoverParent;
