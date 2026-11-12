import { useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useSuggestSummaryFormulaMutation } from "metabase/metabot/api";
import * as Lib from "metabase-lib";
import type { Database, DatabaseId } from "metabase-types/api";

import {
  addFormula,
  compileFormula,
  getFormulaMode,
  getFormulaReferences,
  getFormulaRequest,
} from "../generate-formula";
import type { SummaryWellId } from "../types";

type FormulaGeneratorOptions = {
  query: Lib.Query;
  stageIndex: number;
  wellId: SummaryWellId;
  onAdd: (nextQuery: Lib.Query, wellId: SummaryWellId) => void;
};

export type FormulaGenerationState =
  | { status: "idle" }
  | { status: "loading"; prompt: string }
  | { status: "error"; prompt: string; message: string };

export type FormulaGenerator = {
  wellId: SummaryWellId;
  databaseId: DatabaseId | null;
  state: FormulaGenerationState;
  /** Asks AI for a formula for `prompt` and adds it to the well. Resolves to whether it was added. */
  generate: (prompt: string, database: Database) => Promise<boolean>;
};

/**
 * Generates a formula for a well from a natural-language prompt, with the summary-formula endpoint.
 *
 * It doesn't check whether the user can use AI or whether the database supports custom
 * expressions, so it makes no requests until `generate` is called.
 */
export function useFormulaGenerator({
  query,
  stageIndex,
  wellId,
  onAdd,
}: FormulaGeneratorOptions): FormulaGenerator {
  const [suggestFormula] = useSuggestSummaryFormulaMutation();
  const [state, setState] = useState<FormulaGenerationState>({
    status: "idle",
  });
  // the query can change while a formula is generated, so it's added to the latest one
  const latest = useLatest({ query, stageIndex, onAdd });
  const mode = getFormulaMode(wellId);

  const generate = async (prompt: string, database: Database) => {
    const references = getFormulaReferences(
      latest.current.query,
      latest.current.stageIndex,
      mode,
    );
    if (!references) {
      setState({
        status: "error",
        prompt,
        message: t`There's nothing here a formula could use.`,
      });
      return false;
    }
    setState({ status: "loading", prompt });
    const { data, error } = await suggestFormula(
      getFormulaRequest(references, prompt, mode),
    );
    if (!data) {
      setState({
        status: "error",
        prompt,
        message: getErrorMessage(
          error,
          t`Couldn't generate a formula. Try again.`,
        ),
      });
      return false;
    }
    const current = latest.current;
    const result = compileFormula(
      current.query,
      current.stageIndex,
      mode,
      data.expression,
      database,
    );
    if (result.error) {
      setState({
        status: "error",
        prompt,
        message: t`The generated formula isn't valid: ${result.error.message}`,
      });
      return false;
    }
    setState({ status: "idle" });
    current.onAdd(
      addFormula(
        current.query,
        current.stageIndex,
        wellId,
        data.name,
        result.expressionClause,
      ),
      wellId,
    );
    return true;
  };

  return { wellId, databaseId: Lib.databaseID(query), state, generate };
}
