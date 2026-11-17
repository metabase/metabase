import { Flex, Group, Icon, Pill } from "metabase/ui";
import type { IconName } from "metabase-types/api";

/** A group's members on its card, in order */
export function GroupMemberPills({
  labels,
  icon,
}: {
  labels: string[];
  /** What each member is, shown in its pill like a clause pill's icon */
  icon?: IconName;
}) {
  return (
    <Group gap="xs" wrap="wrap">
      {labels.map((label, index) => (
        <Pill key={`${label}-${index}`} bdrs="xl">
          {icon ? (
            <Flex component="span" align="center" gap="xs">
              <Icon name={icon} size={12} c="text-secondary" />
              {label}
            </Flex>
          ) : (
            label
          )}
        </Pill>
      ))}
    </Group>
  );
}
