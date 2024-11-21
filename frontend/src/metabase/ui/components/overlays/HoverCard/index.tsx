import {
  type HoverCardDropdownProps,
  type HoverCardProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { Guard } from "metabase/ui";
export { getHoverCardOverrides } from "./HoverCard.styled";

export type { HoverCardProps, HoverCardDropdownProps } from "@mantine/core";

export const HoverCard = (props: HoverCardProps) => {
  return <MantineHoverCard {...props} />;
};
HoverCard.Target = MantineHoverCard.Target;
HoverCard.Dropdown = MantineHoverCard.Dropdown;
// function Dropdown(props: HoverCardDropdownProps) {
// return (
//   <Guard {...props}>
//     <MantineHoverCard.Dropdown {...props} />
//   </Guard>
// );
// };
