import { createMessageId } from "metabase/metabot/state/utils";
import type { MetabotStateContext } from "metabase-types/api";

import type { MetabotAgentTurnError, MetabotChatMessage } from "../state/types";

import { convertSlackChatMessage } from "./slack-mrkdwn";

export type FetchedChatMessage = MetabotChatMessage & {
  finished?: boolean | null;
  error?: MetabotAgentTurnError | null;
};

/**
 * A single conversation with its flattened chat messages, as returned by
 * `GET /api/metabot/conversations/:id`.
 */
export type MetabotConversationDetail = {
  conversation_id: string;
  created_at: string;
  title: string | null;
  user_id: number | null;
  profile_id?: string | null;
  state?: MetabotStateContext;
  chat_messages: FetchedChatMessage[];
};

// NOTE: this should go away long-term. The FE should refactor around turns instead of a flat list of message.
// this would allow for annotations like error / finished at this higher level abstraction.

/**
 * Convert a fetched conversation's `chat_messages` payload into the shape the
 * live chat UI expects: strip the BE's `finished` / `error` annotations off
 * the last agent message of each turn and re-emit them as dedicated trailing
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
