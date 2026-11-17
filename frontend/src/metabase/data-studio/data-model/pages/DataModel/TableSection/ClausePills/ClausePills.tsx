import { Flex, Group, Icon, Pill } from "metabase/ui";
import type { IconName } from "metabase-types/api";

/** One clause of a segment's or measure's definition, as a card shows it */
export type QueryClause = {
  kind: "aggregation" | "filter";
  name: string;
};

const CLAUSE_ICONS: Record<QueryClause["kind"], IconName> = {
  aggregation: "sum",
  filter: "filter",
};

/** A clause's kind icon and display name, inside a pill */
function ClausePillLabel({ kind, name }: QueryClause) {
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
