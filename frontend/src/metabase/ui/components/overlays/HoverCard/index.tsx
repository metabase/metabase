import {
  type HoverCardDropdownProps,
  type HoverCardProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { Guard } from "../Guard";
export { getHoverCardOverrides } from "./HoverCard.styled";

export const HoverCard = (props: HoverCardProps) => {
  return <MantineHoverCard {...props} />;
};
HoverCard.Target = MantineHoverCard.Target;
HoverCard.Dropdown = function Dropdown(props: HoverCardDropdownProps) {
  return (
    <Guard {...props}>
      <MantineHoverCard.Dropdown {...props} />
    </Guard>
  );
};
