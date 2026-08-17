import {
  type HoverCardDropdownProps,
  type HoverCardProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui/components/utils/PreventEagerPortal";

import { OverlayStackItem } from "../overlay-stack";
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

function HoverCardRoot(props: HoverCardProps) {
  return <MantineHoverCard {...props} />;
}

export const HoverCard = Object.assign(HoverCardRoot, MantineHoverCard, {
  Dropdown: HoverCardDropdown,
});
