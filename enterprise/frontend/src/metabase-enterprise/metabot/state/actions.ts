import { createAsyncThunk } from "metabase/lib/redux";
import type { MetabotAgentMessage } from "metabase-types/api";

import { metabot } from "./reducer";

export const { addMessage, reset } = metabot.actions;

export const processMetabotMessages = createAsyncThunk(
  "metabase-enterprise/metabot/processResponseMessages",
  async (messages: MetabotAgentMessage[], { dispatch }) => {
    for (const message of messages) {
      if (message.type === "metabot.reaction/message") {
        await dispatch(
          addMessage({
            source: "llm",
            llm_response_type: "message",
            message: message.message,
          }),
        );
      } else {
        console.error(
          "Encounted unexpected message type from Metabot",
          message,
        );
      }
    }
  },
);
