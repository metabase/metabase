import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import {
  Group,
  Icon,
  Paper,
  Stack,
  Text,
  type TextProps,
  rem,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

export type MetadataRow = {
  icon: IconName;
  content: ReactNode;
  to?: string;
};

interface MetadataLinkCardProps {
  rows: MetadataRow[];
}

export function MetadataLinkCard({ rows }: MetadataLinkCardProps) {
  return (
    <Paper bg="background-secondary" radius={rem(16)} p="md">
      <Stack gap="sm">
        {rows.map((row) => (
          <MetadataRowView key={row.icon} {...row} />
        ))}
      </Stack>
    </Paper>
  );
}

function MetadataRowView({ icon, content, to }: MetadataRow) {
  const textColor: TextProps["c"] = to ? "brand" : "text-secondary";
  const iconColor = to ? "brand" : "text-secondary";
  const body = (
    <Group gap="sm" wrap="nowrap">
      <Icon name={icon} c={iconColor} />
      <Text component="span" c={textColor} fw={to ? 600 : 400}>
        {content}
      </Text>
    </Group>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
