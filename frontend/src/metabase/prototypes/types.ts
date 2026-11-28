import type { ComponentType } from "react";

export type PrototypeDefinition = {
  id: string;
  name: string;
  description: string;
  /**
   * Rail section, typically a round of prototyping ("Iteration 1"). Sections
   * appear in registration order; entries without one sit above the sections.
   */
  group?: string;
  /** Tucked into the group's collapsed "Other drafts" list in the rail. */
  draft?: boolean;
  Component: ComponentType;
};
