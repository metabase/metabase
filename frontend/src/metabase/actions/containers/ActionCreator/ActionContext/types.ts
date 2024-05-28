import type { ReactNode } from "react";

import type { WritebackAction } from "metabase-types/api";

export type EditableActionParams = Pick<
  Partial<WritebackAction>,
  "name" | "description"
>;

export type EditorBodyProps = {
  isEditable: boolean;
};

export interface ActionContextProviderProps<T = WritebackAction> {
  initialAction?: T;
  children: ReactNode;
}
