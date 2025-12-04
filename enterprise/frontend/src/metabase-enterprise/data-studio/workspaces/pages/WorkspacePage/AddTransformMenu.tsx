import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import {
  useCreateWorkspaceTransformMutation,
  useValidateTableNameMutation,
} from "metabase-enterprise/api";
import {
  CreateTransformModal,
  type NewTransformValues,
  type ValidationSchemaExtension,
} from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import {
  getInitialNativeSource,
  getInitialPythonSource,
} from "metabase-enterprise/transforms/pages/NewTransformPage/utils";
import type {
  DatabaseId,
  Transform,
  TransformSource,
  WorkspaceId,
} from "metabase-types/api";

type TransformType = "sql" | "python";

type AddTransformMenuProps = {
  databaseId: number;
  workspaceId: number;
  onCreate: (transform: Transform) => void;
};

export const AddTransformMenu = ({
  databaseId,
  workspaceId,
  onCreate,
}: AddTransformMenuProps) => {
  const [modalType, setModalType] = useState<TransformType | null>(null);
  const [createWorkspaceTransform] = useCreateWorkspaceTransformMutation();

  const { data: fetchedSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: false } : skipToken,
  );
  const allowedSchemas = useMemo(
    () =>
      fetchedSchemas.filter((schema) => !schema.startsWith("mb__isolation")),
    [fetchedSchemas],
  );

  const getSource = useCallback(
    (type: TransformType): TransformSource => {
      if (type === "sql") {
        const source = getInitialNativeSource();
        return {
          ...source,
          query: { ...source.query, database: databaseId },
        };
      }
      return {
        ...getInitialPythonSource(),
        "source-database": databaseId,
      };
    },
    [databaseId],
  );

  const handleClose = () => setModalType(null);

  const handleSubmit = useCallback(
    async (values: NewTransformValues): Promise<Transform> => {
      const source = getSource(modalType!);
      const request = values.incremental
        ? {
            id: workspaceId,
            name: values.name,
            description: null,
            source,
            target: {
              type: "table-incremental" as const,
              name: values.targetName,
              schema: values.targetSchema,
              database: databaseId,
              "target-incremental-strategy": {
                type: "append" as const,
              },
            },
          }
        : {
            id: workspaceId,
            name: values.name,
            description: null,
            source,
            target: {
              type: "table" as const,
              name: values.targetName,
              schema: values.targetSchema,
              database: databaseId,
            },
          };

      const transform = await createWorkspaceTransform(request).unwrap();
      onCreate(transform);
      handleClose();
      return transform;
    },
    [
      databaseId,
      workspaceId,
      modalType,
      createWorkspaceTransform,
      onCreate,
      getSource,
    ],
  );

  const validationSchemaExtension = useTransformValidation({
    databaseId,
    workspaceId,
  });

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon size="2rem" p="0" ml="auto" aria-label={t`Add transform`}>
            <Icon name="add" size={16} aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="sql" />}
            onClick={() => setModalType("sql")}
          >
            {t`SQL Transform`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="code_block" />}
            onClick={() => setModalType("python")}
          >
            {t`Python Transform`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalType && (
        <CreateTransformModal
          source={getSource(modalType)}
          defaultValues={{ name: t`New transform` }}
          onClose={handleClose}
          schemas={allowedSchemas}
          showIncrementalSettings={false}
          validationSchemaExtension={validationSchemaExtension}
          handleSubmit={handleSubmit}
        />
      )}
    </>
  );
};

type ValidationResult = true | Yup.ValidationError;
type DebouncedValidateFn = ((value: string, schema: string | null) => void) & {
  cancel: () => void;
};

export const useTransformValidation = ({
  databaseId,
  workspaceId,
}: {
  databaseId: DatabaseId;
  workspaceId: WorkspaceId;
}): ValidationSchemaExtension => {
  /**
   * Async Yup validation for targetName field uniqueness with proper cancellation.
   */
  const [validateTableName] = useValidateTableNameMutation();
  const debouncedValidateRef = useRef<{
    validate: DebouncedValidateFn;
    pendingResolve: ((result: ValidationResult) => void) | null;
    abortController: AbortController | null;
  }>();

  const VALIDATION_DEBOUNCE_MS = 500;

  const getDebouncedValidate = useCallback(() => {
    if (!debouncedValidateRef.current) {
      const validate = _.debounce(
        async (value: string, schema: string | null) => {
          if (!value) {
            return new Yup.ValidationError("Table name is required");
          }

          // Cancel any pending request
          debouncedValidateRef.current?.abortController?.abort();
          const abortController = new AbortController();
          if (debouncedValidateRef.current) {
            debouncedValidateRef.current.abortController = abortController;
          }

          try {
            const result = await validateTableName({
              id: workspaceId,
              db_id: databaseId,
              target: { type: "table", name: value, schema },
            }).unwrap();

            // Check if this request was aborted
            if (abortController.signal.aborted) {
              return;
            }

            const validationResult =
              result === "OK" ||
              new Yup.ValidationError(result ?? "Invalid table name");
            debouncedValidateRef.current?.pendingResolve?.(validationResult);
          } catch (error: unknown) {
            // Ignore aborted requests
            if (abortController.signal.aborted) {
              return;
            }

            const errorMessage =
              (error as { data?: string })?.data ?? "Validation failed";
            debouncedValidateRef.current?.pendingResolve?.(
              new Yup.ValidationError(errorMessage),
            );
          }
        },
        VALIDATION_DEBOUNCE_MS,
      );
      debouncedValidateRef.current = {
        validate,
        pendingResolve: null,
        abortController: null,
      };
    }
    return debouncedValidateRef.current;
  }, [databaseId, workspaceId, validateTableName]);

  return useMemo(
    () => ({
      targetName: Yup.string()
        .required("Target table name is required")
        .test(async (value, context) => {
          const debounced = getDebouncedValidate();
          debounced.validate.cancel();
          debounced.abortController?.abort();

          if (!value) {
            return context.createError({
              message: "Target table name is required",
            });
          }
          const schema = context.parent.targetSchema;

          return new Promise<true | Yup.ValidationError>((resolve) => {
            debounced.pendingResolve = resolve;
            debounced.validate(value, schema);
          }).then((result) => {
            return result === true || context.createError(result);
          });
        }),
    }),
    [getDebouncedValidate],
  );
};
