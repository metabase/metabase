import { ComponentType, ReactNode } from "react";

export interface EngineFieldOverride {
  type?: ComponentType;
  name?: string;
  title?: string;
  description?: ReactNode;
}
