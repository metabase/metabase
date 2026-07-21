import { getMetabotConversation } from "metabase/metabot/state";
import type { MetabotSlashCommandHandler } from "metabase/plugins/oss/audit";
import { addUndo } from "metabase/redux/undo";
import { push } from "metabase/router";
import { getUserIsAdmin } from "metabase/selectors/user";
import * as Urls from "metabase/urls";

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
  dispatch(push(Urls.monitorAiAuditingConversationDetail(conversationId)));
  return true;
};
