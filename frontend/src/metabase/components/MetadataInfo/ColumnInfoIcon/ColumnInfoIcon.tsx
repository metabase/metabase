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
import { PopoverHoverTarget, HoverParent } from "../InfoIcon";
export { HoverParent };

export type QueryColumnInfoIconProps = QueryColumnInfoPopoverProps & {
  showIfEmpty?: boolean;
};

export function QueryColumnInfoIcon({
  className,
  delay = [0, 150],
  showIfEmpty = false,
  ...props
}: QueryColumnInfoIconProps) {
  const { query, stageIndex, column } = props;
  const { description = "" } = query
    ? Lib.displayInfo(query, stageIndex, column)
    : {};

  if (!description && !showIfEmpty) {
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

export type TableColumnInfoIconProps = TableColumnInfoPopoverProps & {
  showIfEmpty?: boolean;
};

export function TableColumnInfoIcon({
  className,
  delay = [0, 150],
  field,
  showIfEmpty = false,
  ...props
}: TableColumnInfoIconProps) {
  if (!field.description && !showIfEmpty) {
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
