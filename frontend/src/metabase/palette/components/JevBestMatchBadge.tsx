import { t } from "ttag";

import { Badge, Group, Icon, Text, Tooltip } from "metabase/ui";

interface JevBestMatchBadgeProps {
  confidence: number;
  elapsedMs: number;
}

export const JevBestMatchBadge = ({
  confidence,
  elapsedMs,
}: JevBestMatchBadgeProps) => (
  <Tooltip
    label={t`Jev is ${Math.round(confidence * 100)}% confident this is what you meant`}
  >
    <Group gap="xs" wrap="nowrap" data-testid="jev-best-match">
      <Badge
        variant="light"
        size="sm"
        leftSection={<Icon name="sparkles" size={10} />}
      >
        {t`Best match`}
      </Badge>
      <Text
        c="text-tertiary"
        fz="0.6875rem"
        lh="1rem"
        style={{ whiteSpace: "nowrap" }}
      >
        {t`Jev · ${Math.round(elapsedMs)}ms`}
      </Text>
    </Group>
  </Tooltip>
);
