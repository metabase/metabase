import type { Extension } from "@codemirror/state";
import { useMemo, useRef } from "react";

import {
  EXPRESSION_AI_COMPLETION_DELAY_SETTING,
  EXPRESSION_AI_COMPLETION_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import { formatIdentifier } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import { useCompleteExpressionMutation } from "../GenerateExpressionPrompt/api";

import { type FetchCompletion, aiCompletion } from "./ai-completion";

type Options = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  name?: string;
  isEnabled: boolean;
};

export function useAiCompletion({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  name,
  isEnabled,
}: Options): Extension[] {
  const [isSettingEnabled] = usePrototypeSetting(
    EXPRESSION_AI_COMPLETION_SETTING,
  );
  const [delayMs] = usePrototypeSetting(EXPRESSION_AI_COMPLETION_DELAY_SETTING);
  const [completeExpression] = useCompleteExpressionMutation();

  const columns = useMemo(
    () =>
      availableColumns.map((column) =>
        formatIdentifier(
          Lib.displayInfo(query, stageIndex, column).longDisplayName,
        ),
      ),
    [query, stageIndex, availableColumns],
  );

  // The extension reads the latest values, so a new column list or name does
  // not rebuild the editor's extensions.
  const contextRef = useRef({ expressionMode, columns, name });
  contextRef.current = { expressionMode, columns, name };

  const fetchCompletion = useMemo<FetchCompletion>(
    () =>
      ({ prefix, suffix }) => {
        const { expressionMode, columns, name } = contextRef.current;
        const request = completeExpression({
          prefix,
          suffix,
          expression_mode: expressionMode,
          columns,
          name,
        });
        return {
          promise: request.unwrap().then(({ completion }) => completion),
          abort: request.abort,
        };
      },
    [completeExpression],
  );

  return useMemo(
    () =>
      isEnabled && isSettingEnabled
        ? aiCompletion({ fetchCompletion, delayMs })
        : [],
    [isEnabled, isSettingEnabled, fetchCompletion, delayMs],
  );
}
