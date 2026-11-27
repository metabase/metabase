import { useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useGenerateCustomExpressionMutation } from "metabase/metabot/api";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { getMetabotEntityId } from "metabase/metabot/state";
import { useSetting } from "metabase/settings";
import * as Lib from "metabase-lib";

import { addSummaryFormula } from "../SummaryFormulaBar/utils";
import { trackSummaryFormulaGenerated } from "../analytics";
import type { SummaryWellId } from "../types";

import type {
  SummaryFormulaAccess,
  SummaryFormulaGenerateResult,
  SummaryFormulaGenerator,
  SummaryFormulaGeneratorOptions,
} from "./types";
import {
  compileFormula,
  getFormulaRequest,
  truncateGenerateErrorMessage,
} from "./utils";

/**
 * Drafts formulas for the summary wells with AI.
 * Callers should generate one formula at a time, checking `isGenerating`.
 * Requests still in flight when it unmounts are cancelled.
 */
export function useSummaryFormulaGenerator({
  query,
  stageIndex,
  isEnabled,
  onAdd,
}: SummaryFormulaGeneratorOptions): SummaryFormulaGenerator {
  const [generateCustomExpression] = useGenerateCustomExpressionMutation();
  const { hasNlqAccess, isLoading: isLoadingAccess } =
    useUserMetabotPermissions();
  // the endpoint runs on the mini model, whose connection can differ from Metabot's
  const isMiniModelConfigured = !!useSetting("llm-mini-model-configured?");
  const access = getAccess(
    isLoadingAccess,
    hasNlqAccess && isMiniModelConfigured,
  );
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    isEnabled && databaseId != null ? { id: databaseId } : skipToken,
  );
  // the query can change while a formula is generated, so the formula is added to the latest one
  const latest = useLatest({ query, stageIndex, database, onAdd });
  const pendingRequests = useRef(new Set<{ abort: () => void }>());
  const isUnmounted = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const requests = pendingRequests.current;
    isUnmounted.current = false;
    return () => {
      isUnmounted.current = true;
      requests.forEach((request) => request.abort());
      requests.clear();
    };
  }, []);

  const generateBasedOnPrompt = async (
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
    const startTime = Date.now();
    const request = generateCustomExpression({
      ...result.request,
      metabot_id: getMetabotEntityId(),
    });
    pendingRequests.current.add(request);
    setIsGenerating(true);
    const { data, error } = await request;
    pendingRequests.current.delete(request);
    if (isUnmounted.current) {
      return { status: "cancelled" };
    }
    setIsGenerating(false);
    const durationMs = Date.now() - startTime;
    if (data == null) {
      trackSummaryFormulaGenerated(wellId, "failure", durationMs);
      return {
        status: "error",
        message: truncateGenerateErrorMessage(
          getErrorMessage(error, t`Couldn't generate a formula. Try again.`),
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
      trackSummaryFormulaGenerated(wellId, "failure", durationMs);
      return { status: "invalid", source: data.expression, name: data.name };
    }
    trackSummaryFormulaGenerated(wellId, "success", durationMs);
    current.onAdd(
      addSummaryFormula(current.query, current.stageIndex, wellId, {
        name: data.name,
        clause: expressionClause,
        source: data.expression,
      }),
      wellId,
    );
    return { status: "added" };
  };

  return { access, isGenerating, generateBasedOnPrompt };
}

function getAccess(
  isLoading: boolean,
  isAvailable: boolean,
): SummaryFormulaAccess {
  if (isLoading) {
    return "loading";
  }
  return isAvailable ? "available" : "unavailable";
}
