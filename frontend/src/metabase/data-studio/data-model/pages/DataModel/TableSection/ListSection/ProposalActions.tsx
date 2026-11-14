import { t } from "ttag";

import { ActionIcon, Group, Icon, Tooltip } from "metabase/ui";

/**
 * A proposal's accept (✓) and dismiss (✕) icon buttons, for people who can
 * act on it
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
      {canAccept && (
        <>
          <Tooltip label={t`Accept`}>
            <ActionIcon size="sm" aria-label={t`Accept`} onClick={onAccept}>
              <Icon name="check" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t`Dismiss`}>
            <ActionIcon size="sm" aria-label={t`Dismiss`} onClick={onDismiss}>
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        </>
      )}
    </Group>
  );
}
