import { t } from "ttag";

import { ActionIcon, Group, Icon, Text, UnstyledButton } from "metabase/ui";

type EventDefinitionSummaryProps = {
  id?: string;
  name: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  removeLabel?: string;
  onEdit: () => void;
  onRemove?: () => void;
};

/** A collapsed event definition: its name, with edit and remove buttons. */
export const EventDefinitionSummary = ({
  id,
  name,
  placeholder,
  disabled,
  removeLabel = t`Remove`,
  onEdit,
  onRemove,
}: EventDefinitionSummaryProps) => (
  <Group
    id={id}
    gap="xs"
    wrap="nowrap"
    p="sm"
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="sm"
  >
    <UnstyledButton flex={1} miw={0} disabled={disabled} onClick={onEdit}>
      <Text truncate c={name ? "text-primary" : "text-tertiary"}>
        {name ?? placeholder}
      </Text>
    </UnstyledButton>
    <ActionIcon
      c="icon-primary"
      aria-label={t`Edit`}
      disabled={disabled}
      onClick={onEdit}
    >
      <Icon name="pencil" />
    </ActionIcon>
    {onRemove && (
      <ActionIcon variant="subtle" aria-label={removeLabel} onClick={onRemove}>
        <Icon name="close" />
      </ActionIcon>
    )}
  </Group>
);
