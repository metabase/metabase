import { createAsyncThunk } from "metabase/lib/redux";
import { metabotAgent } from "metabase-enterprise/api";
import type { MetabotAgentMessage } from "metabase-types/api";

import { metabot } from "./reducer";
import { getContext, getHistory } from "./selectors";
import type { MetabotStoreState } from "./types";

export const { addMessage } = metabot.actions;

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

export const sendMessage = createAsyncThunk(
  "metabase-enterprise/metabot/sendMessage",
  async (message: string, { dispatch, getState }) => {
    const state = getState() as MetabotStoreState;
    const messages = getHistory(state);
    const context = getContext(state);

    dispatch(addMessage({ source: "user", message, context }));

    const reqPayload = { message, messages, context };
    const result = await dispatch(
      metabotAgent.initiate(reqPayload, { fixedCacheKey: "metabot" }),
    );

    // TODO: work with design to find a way to present error messages
    // for now this gets handled via console.error by the caller
    if (result.error) {
      throw result.error;
    }

    await dispatch(processMetabotMessages(result.data || []));
  },
);
