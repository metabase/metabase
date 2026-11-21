import { useEffect, useRef } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useGenerateCustomExpressionMutation } from "metabase/metabot/api";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import * as Lib from "metabase-lib";

import { addSummaryFormula } from "../SummaryFormulaBar/utils";
import type { SummaryWellId } from "../types";

import type {
  SummaryFormulaAccess,
  SummaryFormulaGenerateResult,
  SummaryFormulaGenerator,
  SummaryFormulaGeneratorOptions,
} from "./types";
import { compileFormula, getFormulaRequest } from "./utils";

/**
 * Drafts formulas for the summary wells with AI.
 * Requests still in flight when it unmounts are cancelled.
 */
export function useSummaryFormulaGenerator({
  query,
  stageIndex,
  isEnabled,
  onAdd,
}: SummaryFormulaGeneratorOptions): SummaryFormulaGenerator {
  const [generateCustomExpression] = useGenerateCustomExpressionMutation();
  const { canUseNlq, isLoading: isLoadingAccess } = useUserMetabotPermissions();
  const access: SummaryFormulaAccess = isLoadingAccess
    ? "loading"
    : canUseNlq
      ? "available"
      : "unavailable";
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    isEnabled && databaseId != null ? { id: databaseId } : skipToken,
  );
  // the query can change while a formula is generated, so the formula is added to the latest one
  const latest = useLatest({ query, stageIndex, database, onAdd });
  const pendingRequests = useRef(new Set<{ abort: () => void }>());
  const isUnmounted = useRef(false);

  useEffect(() => {
    const requests = pendingRequests.current;
    isUnmounted.current = false;
    return () => {
      isUnmounted.current = true;
      requests.forEach((request) => request.abort());
      requests.clear();
    };
  }, []);

  const generate = async (
    wellId: SummaryWellId,
    prompt: string,
  ): Promise<SummaryFormulaGenerateResult> => {
    const result = getFormulaRequest(
      latest.current.query,
      latest.current.stageIndex,
      wellId,
      prompt,
    );
    if (result.status === "error") {
      return result;
    }
    const request = generateCustomExpression(result.request);
    pendingRequests.current.add(request);
    const { data, error } = await request;
    pendingRequests.current.delete(request);
    if (isUnmounted.current) {
      return { status: "cancelled" };
    }
    if (data == null) {
      return {
        status: "error",
        message: getErrorMessage(
          error,
          t`Couldn't generate a formula. Try again.`,
        ),
      };
    }
    const current = latest.current;
    const { expressionClause } = compileFormula(
      current.query,
      current.stageIndex,
      wellId,
      data.expression,
      current.database,
    );
    if (expressionClause == null) {
      return { status: "invalid", source: data.expression, name: data.name };
    }
    current.onAdd(
      addSummaryFormula(current.query, current.stageIndex, wellId, {
        name: data.name,
        clause: expressionClause,
      }),
      wellId,
    );
    return { status: "added" };
  };

  return { access, generate };
}
