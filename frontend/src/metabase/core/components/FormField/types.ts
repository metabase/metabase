import type { ReactNode } from "react";
import type { FieldValidator } from "formik";

export type FieldAlignment = "start" | "end";

export type FieldOrientation = "horizontal" | "vertical";

export interface FieldAttributes {
  name: string;
  validate?: FieldValidator;
}

export interface FieldProps {
  title?: string;
  description?: ReactNode;
  alignment?: FieldAlignment;
  orientation?: FieldOrientation;
}
