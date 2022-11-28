import { ComponentType, ReactNode } from "react";
import type { AnySchema, TestContext } from "yup";
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

export interface DatabaseTestContext extends TestContext<DatabaseValues> {
  from: DatabaseTestSource[];
}

export interface DatabaseTestSource {
  schema: AnySchema;
  value: DatabaseValues;
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
