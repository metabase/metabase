import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useValidateTableNameMutation } from "metabase-enterprise/api";
import { CreateTransformModal } from "metabase-enterprise/transforms/pages/NewTransformPage/CreateTransformModal/CreateTransformModal";
import {
  getInitialNativeSource,
  getInitialPythonSource,
} from "metabase-enterprise/transforms/pages/NewTransformPage/utils";
import type { Transform, TransformSource } from "metabase-types/api";
import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";

type TransformType = "sql" | "python";

type AddTransformMenuProps = {
  databaseId: number;
  onCreate: (transform: Transform) => void;
};

export const AddTransformMenu = ({
  databaseId,
  onCreate,
}: AddTransformMenuProps) => {
  const [modalType, setModalType] = useState<TransformType | null>(null);
  const [validateTableName] = useValidateTableNameMutation();

  const { data: fetchedSchemas = [] } = useListDatabaseSchemasQuery(
    databaseId ? { id: databaseId, include_hidden: false } : skipToken,
  );
  const allowedSchemas = useMemo(
    () =>
      fetchedSchemas.filter((schema) => !schema.startsWith("mb__isolation")),
    [fetchedSchemas],
  );

  const getSource = (type: TransformType): TransformSource => {
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
  };

  const handleClose = () => setModalType(null);

  const handleCreate = (transform: Transform) => {
    onCreate(transform);
    handleClose();
  };

  const handleValidateTableName = useCallback(
    async (tableName: string, schema: string | null) => {
      const result = await validateTableName({
        db_id: databaseId,
        target: { type: "table", name: tableName, schema },
      }).unwrap();
      return result;
    },
    [databaseId, validateTableName],
  );

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
          onCreate={handleCreate}
          onClose={handleClose}
          schemas={allowedSchemas}
          showIncrementalSettings={false}
          validateTableName={handleValidateTableName}
        />
      )}
    </>
  );
};
