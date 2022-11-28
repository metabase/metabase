import { ComponentType, ReactNode } from "react";
import { EngineFieldOption, EngineFieldType } from "metabase-types/api";

export interface EngineFieldOverride {
  type?: EngineFieldType | ComponentType<EngineFieldProps>;
  name?: string;
  title?: string;
  description?: ReactNode;
  placeholder?: string;
  options?: EngineFieldOption[];
}

export interface EngineFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
  placeholder?: string;
}
