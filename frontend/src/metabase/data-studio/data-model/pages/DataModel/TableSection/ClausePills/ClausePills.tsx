import { Flex, Group, Icon, Pill } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

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

/** Each clause as a pill, with an icon for what kind of clause it is */
export function ClausePills({ clauses }: { clauses: QueryClause[] }) {
  return (
    <Group gap="xs" wrap="wrap">
      {clauses.map(({ kind, name }, index) => (
        <Pill key={`${kind}-${name}-${index}`} bdrs="xl">
          <Flex component="span" align="center" gap="xs">
            <Icon name={CLAUSE_ICONS[kind]} size={12} c="text-secondary" />
            {name}
          </Flex>
        </Pill>
      ))}
    </Group>
  );
}
