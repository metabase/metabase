import type { ComponentProps } from "react";

import { GridItemRoot, GridRoot } from "./Grid.styled";

export const Grid = (props: ComponentProps<typeof GridRoot>) => (
  <GridRoot {...props} />
);

export const GridItem = (props: ComponentProps<typeof GridItemRoot>) => (
  <GridItemRoot {...props} />
);
