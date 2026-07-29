import {
  skipToken,
  useGetTransformQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CopyButton } from "metabase/common/components/CopyButton";
import { Box, Breadcrumbs, FixedSizeIcon, Group, Loader } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { TransformId } from "metabase-types/api";

import { TransformOutputItem } from "./TransformOutputItem";

type TransformOutputProps = {
  transformId: TransformId;
};

export const TransformOutput = ({ transformId }: TransformOutputProps) => {
  const {
    data: transform,
    isLoading: isTransformLoading,
    error: transformError,
  } = useGetTransformQuery(transformId);
  const table = transform?.table;

  const {
    data: schemas,
    isLoading: isSchemasLoading,
    error: schemasError,
  } = useListDatabaseSchemasQuery(
    transform
      ? { id: transform.target.database, include_hidden: true }
      : skipToken,
  );
  const isLoading = isTransformLoading || isSchemasLoading;
  const error = transformError || schemasError;

  if (isLoading) {
    return <Loader size="xs" />;
  }

  if (error || !transform) {
    return (
      <Box component="span" c="error">
        {getErrorMessage(error)}
      </Box>
    );
  }

  const {
    schema: schemaName,
    name: tableName,
    database: databaseId,
  } = transform.target;

  return (
    <Group gap="sm" wrap="nowrap" miw={0} lh={1}>
      <Breadcrumbs
        miw={0}
        separator={<FixedSizeIcon name="chevronright" size={12} />}
      >
        {schemaName && (
          <TransformOutputItem
            icon="folder"
            label={schemaName}
            to={
              schemas?.includes(schemaName)
                ? Urls.dataModel({ databaseId, schemaName })
                : undefined
            }
            newTab={true}
            data-testid="output-schema-link"
          />
        )}
        <TransformOutputItem
          icon="table2"
          label={tableName}
          to={table ? Urls.queryBuilderTable(table.id, table.db_id) : undefined}
          newTab={true}
          data-testid="output-table-link"
        />
      </Breadcrumbs>
      <CopyButton
        value={schemaName ? `${schemaName}.${tableName}` : tableName}
      />
    </Group>
  );
};
