import {
  type HoverCardProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { withLazyPortal } from "../utils";
export { getHoverCardOverrides } from "./HoverCard.styled";

export const HoverCard = (props: HoverCardProps) => {
  return <MantineHoverCard {...withLazyPortal(props)} />;
};
HoverCard.Target = MantineHoverCard.Target;
HoverCard.Dropdown = MantineHoverCard.Dropdown;
