import { ComponentType, ReactNode } from "react";
import {
  DatabaseId,
  DatabaseSchedules,
  EngineFieldOption,
  EngineFieldType,
} from "metabase-types/api";

export interface DatabaseValues {
  id?: DatabaseId;
  name: string;
  engine: string | undefined;
  details: Record<string, unknown>;
  schedules: DatabaseSchedules;
  auto_run_queries: boolean;
  refingerprint: boolean;
  cache_ttl: number | null;
  is_sample: boolean;
  is_full_sync: boolean;
  is_on_demand: boolean;
}

export interface EngineOption {
  name: string;
  value: string;
  index: number;
}

export interface EngineFieldOverride {
  name?: string;
  type?: EngineFieldType | ComponentType<EngineFieldProps>;
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
