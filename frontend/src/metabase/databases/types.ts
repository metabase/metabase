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

export type EngineFieldState = "default" | "hidden" | "disabled";

export interface DatabaseFormConfig {
  /** present the form with advanced configuration options */
  isAdvanced?: boolean;
  engine?: {
    /** present the engine field as normal, disabled, or hidden */
    fieldState?: EngineFieldState | undefined;
  };
  name?: {
    /** present the name field as a slug */
    isSlug?: boolean;
  };
}

export type ContinueWithoutDataComponent = (props: {
  onCancel?: () => void;
}) => JSX.Element;

export type FieldType = EngineFieldType | ComponentType<EngineFieldProps>;
