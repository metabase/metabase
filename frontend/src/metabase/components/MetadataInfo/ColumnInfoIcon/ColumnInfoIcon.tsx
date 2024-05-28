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
};

export function QueryColumnInfoIcon({
  className,
  delay,
  size,
  icon,
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
};

export function TableColumnInfoIcon({
  className,
  delay,
  field,
  icon,
  size,
  ...props
}: TableColumnInfoIconProps) {
  return (
    <TableColumnInfoPopover {...props} field={field} delay={delay}>
      <span aria-label={t`More info`}>
        <PopoverDefaultIcon className={className} name={icon} size={size} />
        <PopoverHoverTarget
          className={className}
          name="info_filled"
          hasDescription={Boolean(field.description)}
        />
      </span>
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.HoverParent = HoverParent;
