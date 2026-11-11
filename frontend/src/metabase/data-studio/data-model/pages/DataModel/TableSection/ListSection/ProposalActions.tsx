import { t } from "ttag";

import { ActionIcon, Badge, Group, Icon, Tooltip } from "metabase/ui";

/**
 * A proposal card's "Proposed" badge, then its accept (✓) and dismiss (✕)
 * icon buttons for people who can act on it
 */
export function ProposalActions({
  canAccept,
  onAccept,
  onDismiss,
}: {
  canAccept: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
      <Badge variant="light" color="neutral" mr="xs">
        {t`Proposed`}
      </Badge>
      {canAccept && (
        <>
          <Tooltip label={t`Accept`}>
            <ActionIcon aria-label={t`Accept`} onClick={onAccept}>
              <Icon name="check" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t`Dismiss`}>
            <ActionIcon aria-label={t`Dismiss`} onClick={onDismiss}>
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        </>
      )}
    </Group>
  );
}
