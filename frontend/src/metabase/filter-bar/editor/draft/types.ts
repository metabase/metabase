import type { JSONContent } from "@tiptap/core";

import type { FilterColumn, FilterOperator, FilterParts } from "../../types";
import type { DraftNode } from "../nodes/types";

export type Draft = { node: DraftNode; pos: number };

export type FilterEditorRequest<F> = (
  | { type: "edit"; filter: F; pos: number }
  | { type: "new"; column: FilterColumn | null; pos: number }
) & { targetStage: number };

export type DraftStep = "column" | "operator" | "value";

export type ColumnPart = {
  type: "column";
  column: FilterColumn;
  targetStage: number;
};
export type OperatorPart = { type: "operator"; operator: FilterOperator };
export type ValuesPart = {
  type: "values";
  parts: FilterParts;
  targetStage: number;
};
export type DraftPart = ColumnPart | OperatorPart | ValuesPart;

export type DraftState = {
  step: DraftStep;
  edited: DraftPart | null;
  column: ColumnPart | null;
  operator: OperatorPart | null;
  valuesPart: ValuesPart | null;
  texts: string[];
  text: string;
};

export type DraftParts = Pick<DraftState, "column" | "operator"> & {
  values: readonly unknown[];
  valuesPart?: ValuesPart | null;
};

export type DraftLayout = { content: JSONContent[]; caretIndex: number };
