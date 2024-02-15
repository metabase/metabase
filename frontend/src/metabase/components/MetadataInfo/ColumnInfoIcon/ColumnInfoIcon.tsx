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

import { PopoverHoverTarget, ActiveStyles } from "./ColumnInfoIcon.styled";

export function QueryColumnInfoIcon({
  className,
  delay = [0, 150],
  ...props
}: QueryColumnInfoPopoverProps) {
  const { query, stageIndex, column } = props;
  const { description = "" } = query
    ? Lib.displayInfo(query, stageIndex, column)
    : {};

  return (
    <QueryColumnInfoPopover {...props} delay={delay}>
      <PopoverHoverTarget
        className={className}
        name="info_filled"
        data-no-description={Boolean(description)}
        aria-label={t`More info`}
      />
    </QueryColumnInfoPopover>
  );
}

QueryColumnInfoIcon.ActiveStyles = ActiveStyles;

export function TableColumnInfoIcon({
  className,
  delay = [0, 150],
  field,
  ...props
}: TableColumnInfoPopoverProps) {
  return (
    <TableColumnInfoPopover {...props} field={field} delay={delay}>
      <PopoverHoverTarget
        className={className}
        name="info_filled"
        data-no-description={Boolean(field.description)}
        aria-label={t`More info`}
      />
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.ActiveStyles = ActiveStyles;
