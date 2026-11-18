import { Text, Tooltip } from "metabase/ui";

import type { WhyTarget } from "./WhySidesheet";

/** A target's name on one line, which truncates; a table's database follows it as dimmed text, so it's cut first. */
export function TargetName({ target }: { target: WhyTarget }) {
  const { title, databaseName } = target;
  return (
    <Tooltip
      label={databaseName != null ? `${title} · ${databaseName}` : title}
    >
      <Text truncate="end">
        {title}
        {databaseName != null && (
          <Text component="span" size="sm" c="text-secondary">
            {` · ${databaseName}`}
          </Text>
        )}
      </Text>
    </Tooltip>
  );
}
