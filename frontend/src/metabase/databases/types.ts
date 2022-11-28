import { ComponentType, ReactNode } from "react";

export interface EngineFieldOverride {
  type?: ComponentType<EngineFieldProps>;
  name?: string;
  title?: string;
  description?: ReactNode;
}

export interface EngineFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
  placeholder?: string;
}
