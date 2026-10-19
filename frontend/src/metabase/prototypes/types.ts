import type { ComponentType } from "react";

export type PrototypeDefinition = {
  id: string;
  name: string;
  description: string;
  Component: ComponentType;
};
