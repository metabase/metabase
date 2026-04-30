import type { UnknownAction } from "@reduxjs/toolkit";
import { push } from "react-router-redux";

import { getMetabotConversation } from "metabase/metabot/state";
import type { MetabotSlashCommandHandler } from "metabase/plugins/oss/audit";
import { addUndo } from "metabase/redux/undo";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as EnterpriseUrls from "../../urls";

export const handleMetabotSlashCommand: MetabotSlashCommandHandler = ({
  command,
  agentId,
  dispatch,
  getState,
}) => {
  if (command.cmd !== "inspect") {
    return false;
  }
  if (!getUserIsAdmin(getState())) {
    dispatch(addUndo({ message: "Unknown command" }));
    return true;
  }
  const { conversationId, messages } = getMetabotConversation(
    getState(),
    agentId,
  );
  if (messages.length === 0) {
    dispatch(addUndo({ message: "No message history to inspect" }));
    return true;
  }
  dispatch(
    push(
      EnterpriseUrls.adminMetabotUsageAuditingConversation(conversationId),
    ) as UnknownAction,
  );
  return true;
};
