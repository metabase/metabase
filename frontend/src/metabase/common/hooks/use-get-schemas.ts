import { useMemo } from "react";

import {
  skipToken,
  useListDatabaseSchemaTablesQuery,
  useListVirtualDatabaseTablesQuery,
} from "metabase/api";
import { parseSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type { SchemaId } from "metabase-types/api";

interface Props {
  id: SchemaId;
}

export const useGetSchemas = ({ id, ...args }: Props) => {
  const [dbId, schemaName, opts] = parseSchemaId(id);

  if (!dbId || schemaName === undefined) {
    throw new Error("Schemas ID is of the form dbId:schemaName");
  }

  const query = { id: dbId, schema: schemaName, ...args };

  const virtualDatabaseTables = useListVirtualDatabaseTablesQuery(
    opts?.isDatasets ? query : skipToken,
  );

  const databaseSchemaTables = useListDatabaseSchemaTablesQuery(
    opts?.isDatasets ? skipToken : query,
  );

  const tables = opts?.isDatasets
    ? virtualDatabaseTables
    : databaseSchemaTables;

  const data = useMemo(() => {
    if (tables.isLoading || tables.error) {
      return tables.data;
    }

    return {
      id,
      name: schemaName,
      tables: tables.data,
      database: { id: dbId },
    };
  }, [id, schemaName, tables, dbId]);

  const result = useMemo(() => ({ ...tables, data }), [data, tables]);

  return result;
};
