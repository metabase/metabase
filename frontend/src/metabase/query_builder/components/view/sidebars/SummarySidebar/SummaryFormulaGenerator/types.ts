import type * as Lib from "metabase-lib";

import type { SummaryWellId } from "../types";

export type SummaryFormulaGeneratorOptions = {
  query: Lib.Query;
  stageIndex: number;
  isEnabled: boolean;
  onAdd: (query: Lib.Query, wellId: SummaryWellId) => void;
};

export type SummaryFormulaGenerateResult =
  | { status: "added" }
  | { status: "invalid"; source: string; name: string }
  | { status: "error"; message: string }
  | { status: "cancelled" };

export type SummaryFormulaAccess = "loading" | "available" | "unavailable";

export type SummaryFormulaGenerator = {
  access: SummaryFormulaAccess;
  /** Asks AI for a formula for `prompt` and adds it to the well when it compiles. */
  generate: (
    wellId: SummaryWellId,
    prompt: string,
  ) => Promise<SummaryFormulaGenerateResult>;
};
