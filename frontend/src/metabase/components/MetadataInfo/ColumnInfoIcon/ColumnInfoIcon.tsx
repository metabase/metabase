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

import { PopoverHoverTarget } from "./ColumnInfoIcon.styled";

export function QueryColumnInfoIcon({
  delay = [0, 150],
  ...props
}: QueryColumnInfoPopoverProps) {
  const { query, stageIndex, column } = props;
  const { description } = Lib.displayInfo(query, stageIndex, column);

  return (
    <QueryColumnInfoPopover {...props} delay={delay}>
      <PopoverHoverTarget
        name="info_filled"
        hasDescription={Boolean(description)}
        aria-label={t`More info`}
      />
    </QueryColumnInfoPopover>
  );
}

QueryColumnInfoIcon.HoverTarget = PopoverHoverTarget;

export function TableColumnInfoIcon({
  delay = [0, 150],
  field,
  ...props
}: TableColumnInfoPopoverProps) {
  return (
    <TableColumnInfoPopover {...props} field={field} delay={delay}>
      <PopoverHoverTarget
        name="info_filled"
        hasDescription={Boolean(field.description)}
        aria-label={t`More info`}
      />
    </TableColumnInfoPopover>
  );
}

TableColumnInfoIcon.HoverTarget = PopoverHoverTarget;
