import { c } from "ttag";

import { ActionIcon, Group, Icon, Paper, Text } from "metabase/ui";

type DrillPillProps = {
  label: string;
  onRemove: () => void;
};

/** The drilled cell, with a button that goes back to the analysis's result. */
export const DrillPill = ({ label, onRemove }: DrillPillProps) => (
  <Paper withBorder radius="md" pl="md" pr="xs" py="xs">
    <Group gap="xs" wrap="nowrap">
      <Text fw="bold">{label}</Text>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={c("{0} is what the people in a chart's cell have in common")
          .t`Remove ${label}`}
        onClick={onRemove}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Group>
  </Paper>
);
