import { useCallback, useEffect, useRef, useState } from "react";

import { getErrorMessage } from "metabase/api/utils/errors";
import { formatIdentifier } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import { useGenerateExpressionMutation } from "./api";

// The first try, then retries that get the editor's errors for the earlier tries.
const MAX_ATTEMPTS = 3;

export type GenerateExpressionResult =
  | { expression: string; name?: string }
  /** The request is not possible, or it failed. */
  | { message: string };

type Options = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  /** Absent for a column that is not created yet. */
  name?: string;
  hasDefaultName: boolean;
  /** Returns the editor's error for `source`, or null when it is valid. */
  validate: (source: string) => string | null;
};

/**
 * Asks the AI for an expression, and retries with the editor's error when the
 * result is not valid.
 */
export function useGenerateExpression({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  name,
  hasDefaultName,
  validate,
}: Options) {
  const [generateExpression] = useGenerateExpressionMutation();
  const requestRef = useRef<ReturnType<typeof generateExpression> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cancel = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setIsLoading(false);
  }, []);

  useEffect(() => cancel, [cancel]);

  /** Resolves to null when the request was cancelled. */
  const generate = useCallback(
    async ({
      prompt,
      source,
      cursor,
    }: {
      prompt: string;
      source: string;
      /** Where the user wrote the request in `source`. */
      cursor?: number;
    }): Promise<GenerateExpressionResult | null> => {
      setIsLoading(true);
      const columns = availableColumns.map((column) =>
        formatIdentifier(
          Lib.displayInfo(query, stageIndex, column).longDisplayName,
        ),
      );
      const previousAttempts: { expression: string; error: string }[] = [];

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const request = generateExpression({
          prompt,
          source,
          cursor,
          expression_mode: expressionMode,
          columns,
          name,
          has_default_name: hasDefaultName,
          previous_attempts: previousAttempts,
        });
        requestRef.current = request;
        const result = await request;
        if (requestRef.current !== request) {
          return null;
        }
        if (!result.data) {
          requestRef.current = null;
          setIsLoading(false);
          return isAborted(result.error)
            ? null
            : { message: getErrorMessage(result.error) };
        }
        if ("message" in result.data) {
          requestRef.current = null;
          setIsLoading(false);
          return result.data;
        }
        const validationError = validate(result.data.expression);
        // After the last try, return the expression anyway. The editor shows its error.
        if (validationError == null || attempt === MAX_ATTEMPTS) {
          requestRef.current = null;
          setIsLoading(false);
          return result.data;
        }
        previousAttempts.push({
          expression: result.data.expression,
          error: validationError,
        });
      }
      return null;
    },
    [
      generateExpression,
      validate,
      expressionMode,
      availableColumns,
      name,
      hasDefaultName,
      query,
      stageIndex,
    ],
  );

  return { generate, cancel, isLoading };
}

function isAborted(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
