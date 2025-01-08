import {
  type HoverCardDropdownProps,
  type HoverCardTargetProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";
import { useRef } from "react";
export { getHoverCardOverrides } from "./HoverCard.styled";

export type {
  HoverCardDropdownProps,
  HoverCardTargetProps,
  HoverCardProps,
} from "@mantine/core";

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

const MantineHoverCardTarget = MantineHoverCard.Target;
/** A HoverCard target that opens the dropdown on focus and closes it on blur */
const HoverCardTarget = function Target(
  props: HoverCardTargetProps & React.RefAttributes<HTMLElement>,
) {
  // To get a ref for the target, either use the ref prop or a new, local ref
  const localRef = useRef<HTMLDivElement>(null);
  const targetRef = props.ref && 'current' in (props as any).ref ? props.ref : localRef;

  const trigger = (eventName: string) =>
    targetRef.current?.dispatchEvent(new Event(eventName, {
      bubbles: true,
      cancelable: true,
    })

  return (
    <MantineHoverCardTarget  {...props}>
      <div ref={targetRef} onFocus={() => trigger('mouseover')} onBlur={() => trigger('mouseout')}>
        {props.children}
      </div>
    </MantineHoverCardTarget>
  );
};
HoverCardTarget.displayName = MantineHoverCardTarget.displayName;
MantineHoverCard.Target = HoverCardTarget;

const HoverCard: typeof MantineHoverCard = MantineHoverCard;

export { HoverCard };
