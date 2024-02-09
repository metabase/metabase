import * as Lib from "metabase-lib";

import type { FieldInfoPopoverMLv2Props } from "../FieldInfoPopover";
import { FieldInfoPopoverMLv2 } from "../FieldInfoPopover";

import { PopoverHoverTarget } from "./FieldInfoIcon.styled";

export type FieldInfoIconProps = Omit<FieldInfoPopoverMLv2Props, "delay">;
const LAST_STAGE = -1;

export function FieldInfoIcon(props: FieldInfoIconProps) {
  const { query, column, stage = LAST_STAGE } = props;

  const { description, semanticType } = Lib.displayInfo(query, stage, column);

  const shouldBeActive =
    (description && description !== "") || semanticType !== null;

  return (
    <FieldInfoPopoverMLv2 {...props} delay={[0, 150]}>
      <PopoverHoverTarget name="info_filled" aria-disabled={!shouldBeActive} />
    </FieldInfoPopoverMLv2>
  );
}

FieldInfoIcon.HoverTarget = PopoverHoverTarget;
