import { Flex, Group, Icon, Pill } from "metabase/ui";

/** A segment's filter clauses on its card, one pill each */
export function FilterPills({ names }: { names: string[] }) {
  return (
    <Group gap="xs" wrap="wrap">
      {names.map((name, index) => (
        <Pill key={`${name}-${index}`} bdrs="xl">
          <Flex component="span" align="center" gap="xs">
            <Icon name="filter" size={12} c="text-secondary" />
            {name}
          </Flex>
        </Pill>
      ))}
    </Group>
  );
}
