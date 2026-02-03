import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { getErrorMessage } from "metabase/api/utils";
import { useValidateTableNameMutation } from "metabase-enterprise/api";
import type {
  DatabaseId,
  TransformTarget,
  WorkspaceId,
} from "metabase-types/api";

type UseTransformValidationParams = {
  databaseId: DatabaseId | null;
  target?: TransformTarget;
  workspaceId: WorkspaceId;
};

export const useTransformValidation = ({
  databaseId,
  target,
  workspaceId,
}: UseTransformValidationParams) => {
  const [validateTableName] = useValidateTableNameMutation();

  const validateTableNameDebounceRef = useRef<{
    timeoutId?: ReturnType<typeof setTimeout>;
    pending?: { resolve: (message: string) => void };
  }>({});

  // I wasn't able to simplify this logic any further, but maybe a review would be nice.
  // We wrap debounced validation call in a promise to properly set form state,
  // and we need to handle pending state to prevent multiple validation calls.
  const debouncedValidateTableName = useCallback(
    ({ name, schema }: { name: string; schema?: string }) => {
      const debounceState = validateTableNameDebounceRef.current;

      if (debounceState.timeoutId) {
        clearTimeout(debounceState.timeoutId);
      }

      debounceState.pending?.resolve("OK");
      debounceState.pending = undefined;

      if (databaseId == null) {
        return t`Database ID is missing`;
      }

      return new Promise<string>((resolve) => {
        const pending = { resolve };
        debounceState.pending = pending;

        debounceState.timeoutId = setTimeout(async () => {
          debounceState.timeoutId = undefined;

          let message: string;
          try {
            message = await validateTableName({
              id: workspaceId,
              db_id: databaseId,
              target: { type: "table", name, schema: schema ?? null },
            }).unwrap();
          } catch (error) {
            message = getErrorMessage(error);
          }

          if (debounceState.pending === pending) {
            debounceState.pending = undefined;
            resolve(message);
          }
        }, 300);
      });
    },
    [databaseId, validateTableName, workspaceId],
  );

  const yupSchema = useMemo(
    () => ({
      targetName: Yup.string()
        .required("Target table name is required")
        .test(async (value, context) => {
          if (!value) {
            return context.createError({
              message: t`Target table name is required`,
            });
          }

          const schema = context.parent.targetSchema;

          if (target && target.name === value && target.schema === schema) {
            return true;
          }

          const message = await debouncedValidateTableName({
            name: value,
            schema,
          });

          return message === "OK" ? true : context.createError({ message });
        }),
    }),
    [debouncedValidateTableName, target],
  );

  return yupSchema;
};
