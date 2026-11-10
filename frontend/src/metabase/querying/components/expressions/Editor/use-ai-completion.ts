import type { Extension } from "@codemirror/state";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { fieldApi } from "metabase/api";
import {
  EXPRESSION_AI_COMPLETION_DELAY_SETTING,
  EXPRESSION_AI_COMPLETION_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import { formatIdentifier } from "metabase/querying/expressions";
import { useDispatch } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { useCompleteExpressionMutation } from "../GenerateExpressionPrompt/api";

import { type FetchCompletion, aiCompletion } from "./ai-completion";
import { getColumnType } from "./cursor-context";
import {
  completeOnDevice,
  prepareOnDeviceCompletion,
} from "./on-device-completion";

type Options = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  name?: string;
  database?: Pick<Database, "features"> | null;
  validate: (source: string) => string | null;
  isEnabled: boolean;
};

export function useAiCompletion({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  name,
  database,
  validate,
  isEnabled,
}: Options): Extension[] {
  const [engine] = usePrototypeSetting(EXPRESSION_AI_COMPLETION_SETTING);
  const [delayMs] = usePrototypeSetting(EXPRESSION_AI_COMPLETION_DELAY_SETTING);
  const [completeExpression] = useCompleteExpressionMutation();

  const columns = useMemo(
    () =>
      availableColumns.map((column) => ({
        name: formatIdentifier(
          Lib.displayInfo(query, stageIndex, column).longDisplayName,
        ),
        type: getColumnType(column),
      })),
    [query, stageIndex, availableColumns],
  );

  // The extension reads the latest values, so a new column list or name does
  // not rebuild the editor's extensions.
  const dispatch = useDispatch();
  const getColumnValues = useCallback(
    async (name: string) => {
      const index = columns.findIndex((column) => column.name === name);
      const column = availableColumns[index];
      if (column == null) {
        return [];
      }
      const { fieldId, hasFieldValues } = Lib.fieldValuesSearchInfo(
        query,
        column,
      );
      if (fieldId == null || hasFieldValues !== "list") {
        return [];
      }
      const request = dispatch(
        fieldApi.endpoints.getFieldValues.initiate(fieldId),
      );
      try {
        const { values } = await request.unwrap();
        return values
          .map(([value]) => value)
          .filter((value): value is string => typeof value === "string");
      } finally {
        request.unsubscribe();
      }
    },
    [columns, availableColumns, query, dispatch],
  );

  const context = {
    expressionMode,
    columns,
    name,
    database,
    validate,
    getColumnValues,
  };
  const contextRef = useRef(context);
  contextRef.current = context;

  const isOnDevice = isEnabled && engine === "on-device";
  useEffect(() => {
    if (isOnDevice && database != null) {
      prepareOnDeviceCompletion(contextRef.current);
    }
  }, [isOnDevice, expressionMode, columns, database]);

  const fetchCompletion = useMemo<FetchCompletion>(
    () =>
      ({ prefix, suffix }) => {
        if (engine === "on-device") {
          return completeOnDevice(contextRef.current, { prefix, suffix });
        }
        const { expressionMode, columns, name } = contextRef.current;
        const request = completeExpression({
          prefix,
          suffix,
          expression_mode: expressionMode,
          columns: columns.map((column) => column.name),
          name,
        });
        return {
          promise: request.unwrap().then(({ completion }) => completion),
          abort: request.abort,
        };
      },
    [engine, completeExpression],
  );

  return useMemo(
    () =>
      isEnabled && engine !== "off"
        ? aiCompletion({ fetchCompletion, delayMs })
        : [],
    [isEnabled, engine, fetchCompletion, delayMs],
  );
}
