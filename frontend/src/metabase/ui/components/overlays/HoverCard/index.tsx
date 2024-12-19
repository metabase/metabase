import {
  type HoverCardDropdownProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";
export { getHoverCardOverrides } from "./HoverCard.styled";

export type { HoverCardDropdownProps, HoverCardProps } from "@mantine/core";

const MantineHoverCardDropdown = MantineHoverCard.Dropdown;
const HoverCardDropdown = function Dropdown(props: HoverCardDropdownProps) {
  return (
    <PreventEagerPortal {...props}>
      <MantineHoverCardDropdown {...props} />
    </PreventEagerPortal>
  );
};
HoverCardDropdown.displayName = MantineHoverCardDropdown.displayName;
MantineHoverCard.Dropdown = HoverCardDropdown;

const HoverCard: typeof MantineHoverCard = MantineHoverCard;

export { HoverCard };
