import { useState } from "react";

import {
  skipToken,
  useCreateMeasureMutation,
  useGetTableQueryMetadataQuery,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import { Button, Group, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, Table, TableId } from "metabase-types/api";

import { MEASURE_COLUMNS, MEASURE_TABLES } from "./catalog";

const STAGE = 0;

/** "Sum of Payment" on Invoices, or "Count" when the measure adds up no column. */
function buildDefinition(
  provider: Lib.MetadataProvider,
  table: Table,
  columnName: string | undefined,
): DatasetQuery | null {
  const tableMetadata = Lib.tableOrCardMetadata(provider, table.id);
  if (!tableMetadata) {
    return null;
  }
  const query = Lib.queryFromTableOrCardMetadata(provider, tableMetadata);
  const operator = Lib.availableAggregationOperators(query, STAGE).find(
    (candidate) =>
      Lib.displayInfo(query, STAGE, candidate).shortName ===
      (columnName ? "sum" : "count"),
  );
  if (!operator) {
    return null;
  }
  if (!columnName) {
    return Lib.toJsQuery(
      Lib.aggregate(query, STAGE, Lib.aggregationClause(operator)),
    );
  }
  const column = Lib.aggregationOperatorColumns(operator).find((candidate) => {
    const info = Lib.displayInfo(query, STAGE, candidate);
    return info.displayName === columnName && info.isFromJoin !== true;
  });
  return column
    ? Lib.toJsQuery(
        Lib.aggregate(query, STAGE, Lib.aggregationClause(operator, column)),
      )
    : null;
}

/** Puts a table's fields in the store, for the metadata provider to read. */
function LoadTable({ id }: { id: TableId }) {
  useGetTableQueryMetadataQuery({ id });
  return null;
}

/**
 * The examples use Sample Database measures with fixed names. Lists the ones
 * this instance lacks and creates them on demand; the list of measures
 * refetches after, so the example opens by itself.
 */
export function MissingMeasures({ names }: { names: string[] }) {
  const { data: databases } = useListDatabasesQuery();
  const sample = databases?.data.find((database) => database.is_sample);
  const { data: tables = [], isSuccess: hasTables } = useListTablesQuery(
    sample ? { dbId: sample.id } : skipToken,
  );
  const provider = useMetadataProvider(sample?.id ?? null);
  const [createMeasure] = useCreateMeasureMutation();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tableOf = (name: string) =>
    // The list isn't narrowed to one database, and others have a People too.
    tables.find(
      (table) =>
        table.db_id === sample?.id &&
        table.display_name === MEASURE_TABLES[name],
    );
  const needed = [...new Set(names.flatMap((name) => tableOf(name) ?? []))];
  const definitions = names.map((name) => {
    const table = tableOf(name);
    return {
      name,
      definition: table
        ? buildDefinition(provider, table, MEASURE_COLUMNS[name])
        : null,
    };
  });
  const isReady = definitions.every(({ definition }) => definition != null);
  const absent = names.find((name) => hasTables && !tableOf(name));

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    for (const { name, definition } of definitions) {
      if (definition == null) {
        continue;
      }
      const result = await createMeasure({ name, definition });
      if (result.error) {
        setError(`Couldn’t create ${name}.`);
        break;
      }
    }
    setIsCreating(false);
  };

  return (
    <Stack p="xl" gap="sm" align="flex-start">
      {needed.map((table) => (
        <LoadTable key={table.id} id={table.id} />
      ))}
      <Text fw="bold">
        This example needs measures this instance doesn’t have
      </Text>
      <Stack gap={4} component="ul" m={0} pl="lg">
        {names.map((name) => (
          <Text component="li" key={name}>
            <strong>{name}</strong>:{" "}
            {MEASURE_COLUMNS[name]
              ? `Sum of ${MEASURE_COLUMNS[name]}`
              : "Count"}{" "}
            on the {MEASURE_TABLES[name]} table
          </Text>
        ))}
      </Stack>
      <Group gap="md">
        <Button
          variant="filled"
          disabled={!isReady}
          loading={isCreating}
          onClick={handleCreate}
        >
          {names.length === 1 ? "Create it" : "Create them"}
        </Button>
        <Text c={error ? "feedback-negative" : "text-secondary"}>
          {error ??
            (isReady
              ? "Adds them to the Sample Database on this instance."
              : absent
                ? `The Sample Database has no ${MEASURE_TABLES[absent]} table.`
                : sample
                  ? "Loading the Sample Database’s tables…"
                  : "This instance has no Sample Database: create them in Data Studio with these exact names, then reload.")}
        </Text>
      </Group>
    </Stack>
  );
}
