import { t } from "ttag";

import * as Lib from "metabase-lib";

import type {
  QueryColumnInfoPopoverProps,
  TableColumnInfoPopoverProps,
} from "../ColumnInfoPopover";
import {
  QueryColumnInfoPopover,
  TableColumnInfoPopover,
} from "../ColumnInfoPopover";
import { PopoverHoverTarget, HoverParent, defaultDelay } from "../InfoIcon";
export { HoverParent };

export function QueryColumnInfoIcon({
  className,
  delay = defaultDelay,
  ...props
}: QueryColumnInfoPopoverProps) {
  const { query, stageIndex, column } = props;
  const { description = "" } = query
    ? Lib.displayInfo(query, stageIndex, column)
    : {};

  if (!description) {
    return null;
  }

  return (
    <QueryColumnInfoPopover {...props} delay={delay}>
      <PopoverHoverTarget
        className={className}
        name="info_filled"
        hasDescription={Boolean(description)}
        aria-label={t`More info`}
      />
    </QueryColumnInfoPopover>
  );
}

QueryColumnInfoIcon.HoverParent = HoverParent;

export function TableColumnInfoIcon({
  className,
  delay = defaultDelay,
  field,
  ...props
}: TableColumnInfoPopoverProps) {
  if (!field.description) {
    return null;
  }

  return (
    <TableColumnInfoPopover {...props} field={field} delay={delay}>
      <PopoverHoverTarget
        className={className}
        name="info_filled"
        hasDescription={Boolean(field.description)}
        aria-label={t`More info`}
      />
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.HoverParent = HoverParent;
