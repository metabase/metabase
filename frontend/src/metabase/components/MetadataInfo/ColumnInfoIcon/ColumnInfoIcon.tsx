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
  IconContainer,
} from "../InfoIcon/InfoIcon.styled";
export { HoverParent };

type QueryColumnInfoIconProps = QueryColumnInfoPopoverProps & {
  size?: number;
  icon?: IconName;
  color?: string;
};

export function QueryColumnInfoIcon({
  className,
  delay,
  size = 14,
  icon,
  color,
  ...props
}: QueryColumnInfoIconProps) {
  const { query, stageIndex, column } = props;
  const { description = "" } = query
    ? Lib.displayInfo(query, stageIndex, column)
    : {};

  return (
    <QueryColumnInfoPopover {...props} delay={delay}>
      <IconContainer style={{ fontSize: `${size}px` }} aria-label={t`More info`}>
        <PopoverDefaultIcon
          className={className}
          name={icon ?? getColumnIcon(column)}
          color={color}
        />
        <PopoverHoverTarget
          className={className}
          name="info_filled"
          hasDescription={Boolean(description)}
        />
      </IconContainer>
    </QueryColumnInfoPopover>
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
  size = 14,
  color,
  ...props
}: TableColumnInfoIconProps) {
  return (
    <TableColumnInfoPopover {...props} field={field} delay={delay}>
      <IconContainer style={{ fontSize: `${size}px` }} aria-label={t`More info`}>
        <PopoverDefaultIcon className={className} name={icon} color={color} />
        <PopoverHoverTarget
          className={className}
          name="info_filled"
          hasDescription={Boolean(field.description)}
        />
      </IconContainer>
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.HoverParent = HoverParent;
