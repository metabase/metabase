import { Flex, Group, Icon, Pill } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetQuery, IconName, Table } from "metabase-types/api";

import { useTableQuery } from "../table-segments";

/** One clause of a segment's or measure's definition, as a card shows it */
export type QueryClause = {
  kind: "aggregation" | "filter";
  name: string;
};

const STAGE_INDEX = -1;

const CLAUSE_ICONS: Record<QueryClause["kind"], IconName> = {
  aggregation: "sum",
  filter: "filter",
};

/** A definition's aggregations, then its filters, by their display names */
export function getQueryClauses(query: Lib.Query): QueryClause[] {
  return [
    ...Lib.aggregations(query, STAGE_INDEX).map(
      (aggregation): QueryClause => ({
        kind: "aggregation",
        name: Lib.displayInfo(query, STAGE_INDEX, aggregation).displayName,
      }),
    ),
    ...Lib.filters(query, STAGE_INDEX).map(
      (filter): QueryClause => ({
        kind: "filter",
        name: Lib.displayInfo(query, STAGE_INDEX, filter).displayName,
      }),
    ),
  ];
}

/** A clause's kind icon and display name, inside a pill */
export function ClausePillLabel({ kind, name }: QueryClause) {
  return (
    <Flex component="span" align="center" gap="xs">
      <Icon name={CLAUSE_ICONS[kind]} size={12} c="text-secondary" />
      {name}
    </Flex>
  );
}

/** Each clause as a pill, with an icon for what kind of clause it is */
export function ClausePills({ clauses }: { clauses: QueryClause[] }) {
  return (
    <Group gap="xs" wrap="wrap">
      {clauses.map(({ kind, name }, index) => (
        <Pill key={`${kind}-${name}-${index}`} bdrs="xl">
          <ClausePillLabel kind={kind} name={name} />
        </Pill>
      ))}
    </Group>
  );
}

/**
 * Reads a segment's or measure's definition into its card's pills. A
 * definition the query library can't read gets none, and the card falls back
 * to its server description.
 */
export function useDefinitionClauses(table: Table) {
  const { fromDefinition } = useTableQuery(table);
  return (definition: DatasetQuery): QueryClause[] | undefined => {
    try {
      return getQueryClauses(fromDefinition(definition));
    } catch {
      return undefined;
    }
  };
}
