import {
  type HoverCardDropdownProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";
import { OverlayStackItem } from "metabase/ui/components/overlays/overlay-stack";
export { hoverCardOverrides } from "./HoverCard.config";

export type { HoverCardDropdownProps, HoverCardProps } from "@mantine/core";

const MantineHoverCardDropdown = MantineHoverCard.Dropdown;
const HoverCardDropdown = function Dropdown({
  children,
  ...props
}: HoverCardDropdownProps) {
  return (
    <PreventEagerPortal {...props}>
      <MantineHoverCardDropdown {...props}>
        <OverlayStackItem />
        {children}
      </MantineHoverCardDropdown>
    </PreventEagerPortal>
  );
};
HoverCardDropdown.displayName = MantineHoverCardDropdown.displayName;
MantineHoverCard.Dropdown = HoverCardDropdown;

export const HoverCard: typeof MantineHoverCard = MantineHoverCard;
