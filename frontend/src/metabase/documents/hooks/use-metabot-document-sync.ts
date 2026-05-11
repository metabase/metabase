import { useEffect, useRef } from "react";

import { documentApi } from "metabase/api/document";
import { idTag } from "metabase/api/tags";
import { getMessages } from "metabase/metabot/state/selectors";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state/types";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";

const OMNIBOT_AGENT_ID = "omnibot";

const parseDocumentIdFromArgs = (args?: string): number | null => {
  if (!args) {
    return null;
  }
  try {
    const parsed = JSON.parse(args);
    const id = parsed?.document_id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
};

/**
 * When the Metabot sidebar's `document_update` tool finishes, invalidate the
 * RTK Query cache for the affected document so the open editor reloads it.
 */
export const useMetabotDocumentSync = (currentDocumentId?: number | null) => {
  const dispatch = useDispatch();

  const messages = useSelector((state: State) => {
    if (!state.metabot?.conversations?.[OMNIBOT_AGENT_ID]) {
      return undefined;
    }
    return getMessages(state, OMNIBOT_AGENT_ID);
  });

  const handledToolCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!messages || currentDocumentId == null) {
      return;
    }

    for (const message of messages) {
      if (message.role !== "agent" || message.type !== "tool_call") {
        continue;
      }
      const toolCall = message as MetabotDebugToolCallMessage;
      if (
        toolCall.name !== "document_update" ||
        toolCall.status !== "ended" ||
        handledToolCallIds.current.has(toolCall.id)
      ) {
        continue;
      }

      handledToolCallIds.current.add(toolCall.id);

      const argDocId = parseDocumentIdFromArgs(toolCall.args);
      // Fall back to the currently-open document when args don't parse
      // (e.g. truncated streamed JSON). The omnibot only knows about the
      // open doc anyway.
      const updatedDocumentId = argDocId ?? currentDocumentId;

      dispatch(
        documentApi.util.invalidateTags([idTag("document", updatedDocumentId)]),
      );
    }
  }, [messages, currentDocumentId, dispatch]);
};
