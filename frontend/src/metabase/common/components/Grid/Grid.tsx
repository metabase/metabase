import type { ReactNode } from "react";

import { GridItemRoot, GridRoot } from "./Grid.styled";

export const Grid = (props: { children: ReactNode }) => (
  <GridRoot>{props.children}</GridRoot>
);

export const GridItem = (props: { children: ReactNode }) => (
  <GridItemRoot>{props.children}</GridItemRoot>
);
