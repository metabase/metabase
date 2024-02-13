import { t } from "ttag";
import * as Lib from "metabase-lib";

import type { FieldInfoPopoverProps } from "../FieldInfoPopover";
import { FieldInfoPopover } from "../FieldInfoPopover";

import { PopoverHoverTarget } from "./FieldInfoIcon.styled";

const LAST_STAGE = -1;

export function FieldInfoIcon({
  delay = [0, 150],
  ...props
}: FieldInfoPopoverProps) {
  return (
    <FieldInfoPopover {...props} delay={delay}>
      <PopoverHoverTarget
        name="info_filled"
        hasDescription={hasDescription(props)}
        aria-label={t`More info`}
      />
    </FieldInfoPopover>
  );
}

FieldInfoIcon.HoverTarget = PopoverHoverTarget;

function hasDescription(props: FieldInfoPopoverProps) {
  if ("field" in props) {
    const { field } = props;
    return Boolean(field.description);
  }

  const { query, stageIndex = LAST_STAGE, column } = props;
  const { description } = Lib.displayInfo(query, stageIndex, column);

  return Boolean(description);
}
