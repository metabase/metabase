import type { ComponentType } from "react";

/** Rounds of prototyping; the rail groups entries by iteration. */
export type PrototypeIteration = 1 | 2 | 3;

export type PrototypeDefinition = {
  id: string;
  name: string;
  description: string;
  /** Absent for reference pages that sit above the iterations in the rail. */
  iteration?: PrototypeIteration;
  /** Tucked into the iteration's collapsed "Other drafts" group in the rail. */
  draft?: boolean;
  Component: ComponentType;
};
