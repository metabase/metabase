import type { ComponentType, JSX, ReactNode } from "react";

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

export type FormLocation = "admin" | "setup" | "embedding_setup" | "full-page";

export type FieldState = "default" | "hidden" | "disabled";

export interface DatabaseFormConfig {
  /** present the form with advanced configuration options */
  isAdvanced?: boolean;
  engine?: {
    fieldState?: FieldState;
  };
  name?: {
    fieldState?: FieldState;
    isSlug?: boolean;
  };
}

export type ContinueWithoutDataComponent = (props: {
  onCancel?: () => void;
}) => JSX.Element;

export type FieldType = EngineFieldType | ComponentType<EngineFieldProps>;
