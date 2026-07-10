import { t } from "ttag";

import { ActionIcon, Flex, Icon, Text, Tooltip } from "metabase/ui";

// Pages between a prompt's regenerated replies, ChatGPT/Claude style.
export const MetabotBranchPicker = ({
  index,
  count,
  onChange,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
}) => (
  <Flex align="center" gap={2}>
    <Tooltip label={t`Previous version`} disabled={index === 0}>
      <ActionIcon
        h="sm"
        aria-label={t`Previous version`}
        disabled={index === 0}
        onClick={() => onChange(index - 1)}
      >
        <Icon name="chevronleft" size="0.75rem" />
      </ActionIcon>
    </Tooltip>
    <Text size="sm" c="text-secondary">
      {index + 1} / {count}
    </Text>
    <Tooltip label={t`Next version`} disabled={index === count - 1}>
      <ActionIcon
        h="sm"
        aria-label={t`Next version`}
        disabled={index === count - 1}
        onClick={() => onChange(index + 1)}
      >
        <Icon name="chevronright" size="0.75rem" />
      </ActionIcon>
    </Tooltip>
  </Flex>
);
