import { ComponentType, ReactNode } from "react";
import {
  DatabaseSchedules,
  EngineFieldOption,
  EngineFieldType,
} from "metabase-types/api";

export interface DatabaseValues {
  name: string;
  engine: string | undefined;
  details: Record<string, unknown>;
  schedules: DatabaseSchedules;
  auto_run_queries: boolean;
  refingerprint: boolean;
}

export interface EngineOption {
  name: string;
  value: string;
  index: number;
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
