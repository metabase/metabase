import type * as Lib from "metabase-lib";

import type { SummaryWellId } from "../types";

export type SummaryFormulaBarOptions = {
  query: Lib.Query;
  stageIndex: number;
  onAdd: (query: Lib.Query, wellId: SummaryWellId) => void;
};

export type SummaryFormulaDraft = {
  key: number;
  wellId: SummaryWellId;
  source: string;
};

export type SummaryFormulaInput = {
  start: (source: string, input: HTMLInputElement, onReady: () => void) => void;
  isPending: () => boolean;
  update: (source: string) => void;
};
