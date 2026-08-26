import { createMessageId } from "metabase/metabot/state/utils";
import type { MetabotStateContext } from "metabase-types/api";

import type {
  MetabotAgentTurnError,
  MetabotChatMessage,
  MetabotMessage,
} from "../state/types";

import { convertSlackChatMessage } from "./slack-mrkdwn";

export type FetchedChatMessage = MetabotChatMessage & {
  finished?: boolean | null;
  error?: MetabotAgentTurnError | null;
};

/**
 * A single conversation as returned by `GET /api/metabot/conversations/:id`.
 */
export type MetabotConversationDetail = {
  conversation_id: string;
  created_at: string;
  title: string | null;
  user_id: number | null;
  forked_from_conversation_id: string | null;
  state?: MetabotStateContext;
  messages: MetabotMessage[];
};

/**
 * Convert a flat chat-message payload into the shape the chat UI expects: strip
 * the per-message `finished` / `error` annotations and re-emit them as trailing
 * `turn_aborted` / `turn_errored` messages.
 */
export function normalizeFetchedChatMessages(
  msgs: FetchedChatMessage[],
  { isSlack = false }: { isSlack?: boolean } = {},
): MetabotChatMessage[] {
  return msgs.flatMap((inputMsg) => {
    const msg = isSlack ? convertSlackChatMessage(inputMsg) : inputMsg;
    if (inputMsg.error != null) {
      return [
        msg,
        {
          id: createMessageId(),
          role: "agent",
          type: "turn_errored",
          error: inputMsg.error,
          externalId: "externalId" in msg ? msg.externalId : undefined,
        },
      ];
    }
    if (inputMsg.finished === false) {
      return [
        msg,
        {
          id: createMessageId(),
          role: "agent",
          type: "turn_aborted",
          externalId: "externalId" in msg ? msg.externalId : undefined,
        },
      ];
    }
    return msg;
  });
}
