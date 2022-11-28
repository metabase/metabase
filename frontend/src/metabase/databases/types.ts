import { ComponentType, ReactNode } from "react";
import {
  DatabaseId,
  EngineFieldOption,
  EngineFieldType,
} from "metabase-types/api";

export interface DatabaseValues {
  id?: DatabaseId;
  engine: string | undefined;
  details: Record<string, unknown>;
}

export interface EngineFieldOverride {
  type?: EngineFieldType | ComponentType<EngineFieldProps>;
  name?: string;
  title?: string;
  description?: ReactNode;
  placeholder?: unknown;
  options?: EngineFieldOption[];
}

export interface EngineFieldProps {
  name: string;
  title?: string;
  description?: ReactNode;
  placeholder?: string;
}
