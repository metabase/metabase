import type { ComponentType, ReactNode } from "react";

import type { EngineFieldOption, EngineFieldType } from "metabase-types/api";

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
