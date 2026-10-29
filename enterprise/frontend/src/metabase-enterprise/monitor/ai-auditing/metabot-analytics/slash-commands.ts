import { getUserIsAdmin } from "metabase/current-user";
import type { MetabotSlashCommandHandler } from "metabase/metabot";
import { getIsConversationEmpty } from "metabase/metabot/state";
import { addUndo } from "metabase/redux/undo";
import { navigate } from "metabase/router";
import * as Urls from "metabase/urls";

export const handleMetabotSlashCommand: MetabotSlashCommandHandler = ({
  command,
  conversationId,
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
  if (getIsConversationEmpty(getState(), conversationId)) {
    dispatch(addUndo({ message: "No message history to inspect" }));
    return true;
  }
  navigate(Urls.monitorAiAuditingConversationDetail(conversationId));
  return true;
};
