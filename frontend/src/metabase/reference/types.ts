// Shared types for the legacy reference module.
// These permissive shapes match the loosely-typed redux state and props
// flowing through this module's connected components.

export type EntityLike = any;

export interface FormFieldEntry<T = unknown> {
  name: string;
  value?: T;

  onChange: (...args: any[]) => void;
}
