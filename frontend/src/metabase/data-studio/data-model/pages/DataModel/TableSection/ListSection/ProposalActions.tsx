import { t } from "ttag";

import { ActionIcon, Group, Icon, Tooltip } from "metabase/ui";

/** The search param a new-segment or new-measure page reads a proposal from */
export const PROPOSAL_SEARCH_PARAM = "proposal";

/** The new-item page, filled in from a proposal */
export const getProposalHref = (newItemUrl: string, proposalKey: string) =>
  `${newItemUrl}?${PROPOSAL_SEARCH_PARAM}=${encodeURIComponent(proposalKey)}`;

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
