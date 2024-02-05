import type { HoverCardProps } from "metabase/ui";
import { HoverCard, useDelayGroup } from "metabase/ui";
import type { DatasetColumn } from "metabase-types/api";
import type Field from "metabase-lib/metadata/Field";

import { WidthBoundFieldInfo } from "./FieldInfoPopover.styled";

export const POPOVER_DELAY: [number, number] = [1000, 300];

type Props = {
  field: Field | DatasetColumn;
  timezone?: string;
  delay: [number, number];
} & Pick<HoverCardProps, "children" | "position" | "disabled">;

function FieldInfoPopover({
  field,
  timezone,
  position = "bottom-start",
  disabled,
  delay = POPOVER_DELAY,
  children,
  ...rest
}: Props) {
  const grp = useDelayGroup();

  return (
    <HoverCard
      {...rest}
      position={position}
      disabled={disabled}
      openDelay={grp.shouldDelay ? delay[0] : 0}
      closeDelay={grp.shouldDelay ? delay[1] : 0}
      onOpen={grp.onOpen}
      onClose={grp.onClose}
    >
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown>
        <WidthBoundFieldInfo field={field} timezone={timezone} />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FieldInfoPopover;
