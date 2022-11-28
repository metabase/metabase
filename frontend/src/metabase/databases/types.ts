import { ComponentType } from "react";

export interface EngineFieldOverride {
  type?: ComponentType;
  name?: string;
  title?: string;
  description?: string;
}
