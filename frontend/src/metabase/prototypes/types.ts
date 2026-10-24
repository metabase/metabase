import type { ComponentType } from "react";

/** Rounds of prototyping; the rail groups entries by iteration. */
export type PrototypeIteration = 1 | 2;

export type PrototypeDefinition = {
  id: string;
  name: string;
  description: string;
  iteration: PrototypeIteration;
  Component: ComponentType;
};
