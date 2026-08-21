import { createMessageId } from "metabase/metabot/state/utils";
import type { MetabotStateContext } from "metabase-types/api";

import type { MetabotAgentTurnError, MetabotChatMessage } from "../state/types";

import { convertSlackChatMessage, isSlackProfile } from "./slack-mrkdwn";

export type FetchedChatMessage = MetabotChatMessage & {
  finished?: boolean | null;
  error?: MetabotAgentTurnError | null;
  /** Profile of the message's own row; see `isSlackProfile`. */
  profile_id?: string | null;
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
  /**
   * Profile of the conversation's last message; a summary only. Readers decide
   * whether to convert Slack mrkdwn from each message's own `profile_id`.
   */
  profile_id?: string | null;
  forked_from_conversation_id: string | null;
  state?: MetabotStateContext;
  messages: FetchedChatMessage[];
};

// NOTE: this should go away long-term. The FE should refactor around turns instead of a flat list of message.
// this would allow for annotations like error / finished at this higher level abstraction.

/**
 * Convert a fetched conversation's `messages` payload into the shape the
 * live chat UI expects: strip the BE's `finished` / `error` annotations off
 * the last agent message of each turn and re-emit them as dedicated trailing
 * `turn_aborted` / `turn_errored` messages.
 */
export function normalizeFetchedChatMessages(
  msgs: FetchedChatMessage[],
): MetabotChatMessage[] {
  return msgs.flatMap((inputMsg) => {
    // Decided per message, not per conversation: forking a Slack thread and
    // continuing it on the web leaves both kinds of row in one transcript.
    const msg = isSlackProfile(inputMsg.profile_id)
      ? convertSlackChatMessage(inputMsg)
      : inputMsg;
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
