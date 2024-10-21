import { createAsyncThunk } from "metabase/lib/redux";
import type { MetabotReaction } from "metabase-types/api";

export const processMetabotMessages = createAsyncThunk(
  "metabase-enterprise/metabot/processResponseMessages",
  async (reactions: MetabotReaction[]) => {
    for (const reaction of reactions) {
      // NOTE: add handlers for new reactions here - dispatch other actions as needed
      if (reaction.type === "metabot.reaction/message") {
        // NOTE: do nothing for messages, they're handled automatically
        continue;
      } else {
        console.error(
          "Encounted unexpected message type from Metabot",
          reaction,
        );
      }
    }
  },
);
