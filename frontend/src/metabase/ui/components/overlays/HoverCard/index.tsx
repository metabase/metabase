import {
  type HoverCardProps,
  HoverCard as MantineHoverCard,
} from "@mantine/core";

import { withLazyPortal } from "../utils";
export type { HoverCardProps } from "@mantine/core";
export { getHoverCardOverrides } from "./HoverCard.styled";

export const HoverCard = (props: HoverCardProps) => {
  return <MantineHoverCard {...withLazyPortal(props)} />;
};
