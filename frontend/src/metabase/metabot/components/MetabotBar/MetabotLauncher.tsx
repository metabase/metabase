import { useCallback, useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import { trackMetabotChatOpened } from "metabase/metabot/analytics";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useMetabotAgentsManager } from "metabase/metabot/hooks/use-metabot-agents-manager";
import {
  type MetabotAgentId,
  discardConversationIfEmpty,
  getVisibleAgentId,
  setVisible,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, Icon } from "metabase/ui";
import { uuid } from "metabase/utils/uuid";

import { MetabotPanel } from "./MetabotPanel";

export function MetabotLauncher() {
  const dispatch = useDispatch();
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const { createAgent } = useMetabotAgentsManager([]);
  const visibleAgentId = useSelector(getVisibleAgentId);
  const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);

  const handleToggle = useCallback(() => {
    if (visibleAgentId) {
      dispatch(setVisible({ agentId: visibleAgentId, visible: false }));
      // Drop the chat from history if it was opened but never used.
      dispatch(discardConversationIfEmpty({ agentId: visibleAgentId }));
      return;
    }
    const newId: MetabotAgentId = `chat_${uuid()}`;
    createAgent({ agentId: newId, visible: true, inBar: true });
    trackMetabotChatOpened("header");
  }, [createAgent, dispatch, visibleAgentId]);

  useEffect(
    () =>
      tinykeys(window, {
        "$mod+e": (e) => {
          e.preventDefault();
          handleToggle();
        },
      }),
    [handleToggle],
  );

  if (!hasMetabotAccess) {
    return null;
  }

  return (
    <>
      <Button
        ref={setButtonEl}
        variant="subtle"
        size="xs"
        leftSection={<Icon name="metabot" size={14} />}
        aria-label={t`Ask Metabot`}
        onClick={handleToggle}
        data-testid="metabot-launcher"
      >
        {t`Ask Metabot`}
      </Button>
      {visibleAgentId && buttonEl && (
        <MetabotPanel agentId={visibleAgentId} anchorEl={buttonEl} />
      )}
    </>
  );
}
