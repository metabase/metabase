import {
  type HoverCardDropdownProps,
  type HoverCardTargetProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";
import { forwardRef, useRef } from "react";

import { PreventEagerPortal } from "metabase/ui";
export { hoverCardOverrides } from "./HoverCard.config";

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
/** A HoverCard target that opens the dropdown on focus and closes it on blur.
 * This adds a missing a11y feature to the component.
 *
 * According to Mantine, its native HoverCard " cannot be activated with
 * keyboard, use it to display only additional information that is not required
 * to understand the context." (https://mantine.dev/core/hover-card/#accessibility)
 */
const HoverCardTarget = forwardRef<HTMLDivElement, HoverCardTargetProps>(
  function Target(props, targetRef) {
    const ref = useRef<HTMLDivElement>(null);

    const trigger = (eventName: string) =>
      ref.current?.dispatchEvent(new Event(eventName, { bubbles: true }));

    return (
      <MantineHoverCardTarget {...props} ref={targetRef}>
        <div
          onFocus={() => trigger("mouseover")}
          onBlur={() => trigger("mouseout")}
          ref={ref}
        >
          {props.children}
        </div>
      </MantineHoverCardTarget>
    );
  },
);
MantineHoverCard.Target = HoverCardTarget as typeof MantineHoverCard.Target;

const HoverCard: typeof MantineHoverCard = MantineHoverCard;

export { HoverCard };
