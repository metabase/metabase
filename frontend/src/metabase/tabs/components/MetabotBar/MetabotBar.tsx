import { useCallback, useEffect, useState } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import { trackMetabotChatOpened } from "metabase/metabot/analytics";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useMetabotAgentsManager } from "metabase/metabot/hooks/use-metabot-agents-manager";
import {
  type MetabotAgentId,
  getNonExpandedChatAgentIds,
  getVisibleAgentId,
  setVisible,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { Button, Icon } from "metabase/ui";
import { uuid } from "metabase/utils/uuid";

import S from "./MetabotBar.module.css";
import { MetabotHistoryPopover } from "./MetabotHistoryPopover";
import { MetabotPanel } from "./MetabotPanel";
import { MetabotTab } from "./MetabotTab";

export function MetabotBar() {
  const dispatch = useDispatch();
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const { createAgent, destroyAgent } = useMetabotAgentsManager([]);
  const visibleAgentId = useSelector(getVisibleAgentId);
  const chatAgentIds = useSelector(getNonExpandedChatAgentIds);
  const [askButtonEl, setAskButtonEl] = useState<HTMLButtonElement | null>(
    null,
  );

  const setAgentVisible = useCallback(
    (agentId: MetabotAgentId, visible: boolean) => {
      dispatch(setVisible({ agentId, visible }));
    },
    [dispatch],
  );

  const handleAskMetabot = useCallback(() => {
    if (visibleAgentId) {
      setAgentVisible(visibleAgentId, false);
    }
    const newId: MetabotAgentId = `chat_${uuid()}`;
    createAgent({ agentId: newId, visible: true });
    trackMetabotChatOpened("header");
  }, [createAgent, setAgentVisible, visibleAgentId]);

  const handleSelectTab = useCallback(
    (agentId: MetabotAgentId) => {
      if (visibleAgentId === agentId) {
        setAgentVisible(agentId, false);
        return;
      }
      if (visibleAgentId) {
        setAgentVisible(visibleAgentId, false);
      }
      setAgentVisible(agentId, true);
    },
    [setAgentVisible, visibleAgentId],
  );

  const handleRemoveTab = useCallback(
    (agentId: MetabotAgentId) => {
      destroyAgent({ agentId });
    },
    [destroyAgent],
  );

  useEffect(
    () =>
      tinykeys(window, {
        "$mod+e": (e) => {
          e.preventDefault();
          if (visibleAgentId) {
            setAgentVisible(visibleAgentId, false);
          } else {
            handleAskMetabot();
          }
        },
      }),
    [handleAskMetabot, setAgentVisible, visibleAgentId],
  );

  if (!hasMetabotAccess) {
    return <div className={S.bar} />;
  }

  return (
    <div className={S.bar}>
      {chatAgentIds.map((agentId) => (
        <MetabotTab
          key={agentId}
          agentId={agentId}
          isActive={agentId === visibleAgentId}
          onSelect={() => handleSelectTab(agentId)}
          onRemove={() => handleRemoveTab(agentId)}
        />
      ))}
      <Button
        ref={setAskButtonEl}
        size="xs"
        variant="subtle"
        className={S.button}
        leftSection={<Icon name="metabot" size={14} />}
        onClick={handleAskMetabot}
      >
        {t`Ask Metabot`}
      </Button>
      <MetabotHistoryPopover />
      {visibleAgentId && askButtonEl && (
        <MetabotPanel agentId={visibleAgentId} anchorEl={askButtonEl} />
      )}
    </div>
  );
}
