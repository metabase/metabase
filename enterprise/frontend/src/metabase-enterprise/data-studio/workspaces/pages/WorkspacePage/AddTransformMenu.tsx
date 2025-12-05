import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import {
  useCreateWorkspaceTransformMutation,
  useValidateTableNameMutation,
} from "metabase-enterprise/api";
import {
  CreateTransformModal,
  type NewTransformValues,
} from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import {
  getInitialNativeSource,
  getInitialPythonSource,
} from "metabase-enterprise/transforms/pages/NewTransformPage/utils";
import type {
  CreateWorkspaceTransformRequest,
  DatabaseId,
  Transform,
  TransformSource,
  TransformTarget,
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
      const request: CreateWorkspaceTransformRequest & { id: WorkspaceId } =
        values.incremental
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

export const useTransformValidation = ({
  databaseId,
  target,
  workspaceId,
}: {
  databaseId: DatabaseId;
  target?: TransformTarget;
  workspaceId: WorkspaceId;
}) => {
  const [validateTableName] = useValidateTableNameMutation();

  const yupSchema = useMemo(
    () => ({
      targetName: Yup.string()
        .required("Target table name is required")
        .test(async (value, context) => {
          if (!value) {
            return context.createError({
              message: "Target table name is required",
            });
          }

          const schema = context.parent.targetSchema;

          if (target && target.name === value && target.schema === schema) {
            return true;
          }

          try {
            const message = await validateTableName({
              id: workspaceId,
              db_id: databaseId,
              target: { type: "table", name: value, schema },
            }).unwrap();

            return message === "OK" ? true : context.createError({ message });
          } catch (error) {
            const message = getErrorMessage(error);
            return context.createError({ message });
          }
        }),
    }),
    [databaseId, target, workspaceId, validateTableName],
  );

  return yupSchema;
};
