import { t } from "ttag";

import { ActionIcon, Group, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./EventDefinitionSummary.module.css";

type EventDefinitionSummaryProps = {
  /** The event's name, or `null` without an event. */
  name: string | null;
  /** Shown without an event. */
  placeholder: string;
  onEdit: () => void;
  /** Omitted when there's nothing to remove. */
  onRemove?: () => void;
};

/**
 * A collapsed event definition: its name, which opens it for editing, and a
 * remove button. Without an event, a dashed well with the placeholder.
 */
export const EventDefinitionSummary = ({
  name,
  placeholder,
  onEdit,
  onRemove,
}: EventDefinitionSummaryProps) => (
  <Group
    className={S.root}
    data-empty={name === null}
    gap="xs"
    wrap="nowrap"
    h="2.5rem"
    px="sm"
    bdrs="sm"
  >
    <UnstyledButton className={S.editButton} flex={1} miw={0} onClick={onEdit}>
      <Text truncate c={name !== null ? "text-primary" : "text-secondary"}>
        {name ?? placeholder}
      </Text>
    </UnstyledButton>
    {onRemove && (
      <ActionIcon variant="subtle" aria-label={t`Remove`} onClick={onRemove}>
        <Icon name="close" c="icon-secondary" />
      </ActionIcon>
    )}
  </Group>
);
