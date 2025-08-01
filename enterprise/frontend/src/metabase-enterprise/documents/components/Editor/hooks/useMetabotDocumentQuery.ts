import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { uuid } from "metabase/lib/uuid";
import { aiStreamingQuery } from "metabase-enterprise/api/ai-streaming";

const ENDPOINT = "/api/ee/metabot-v3/v2/agent-streaming"; // TODO: we should get our own endpoint
const EXTRA_PROMPT = ", do not ask me any further clarifying questions";

export const useMetabotDocumentQuery = () => {
  const [createQuestion] = useCreateCardMutation();

  const queryMetabot = useCallback(
    async ({ prompt }: { prompt: string }) => {
      const messageId = uuid();

      const response = await aiStreamingQuery(
        {
          url: ENDPOINT,
          body: {
            message: prompt + EXTRA_PROMPT,
            conversation_id: messageId,
            context: { user_is_viewing: [] },
            history: [],
            state: {},
          },
        },
        {},
      );

      // FIXME: get the backend to do all this processing - this is just a hacky prototype
      const description = response?.text;

      const queryToolCall: any = response.toolCalls?.findLast(
        (call: any) => call.toolName === "construct_notebook_query",
      );

      if (!queryToolCall) {
        console.error("No tool call found in Metabot response");
        return { error: description };
      }

      let vizSettings: any = {};
      let query = null;
      try {
        const args = JSON.parse(queryToolCall.args || {});
        vizSettings = args.viz_settings ?? {};
      } catch (e) {
        return { error: description };
      }

      try {
        // captures text inside triple backticks
        query = JSON.parse(queryToolCall.value.match(/```(.*?)```/s)[1]);
      } catch (e) {
        console.error("Failed to parse query from Metabot response", e);
      }

      if (!query) {
        return { error: description };
      }

      const createQuestionResponse = await createQuestion({
        dataset_query: query,
        name: "Exploration",
        type: "question",
        in_report: true,
        display: vizSettings.type ?? "table",
        visualization_settings: vizSettings ?? {},
      });

      const questionId = createQuestionResponse?.data?.id;

      if (!questionId) {
        return { error: t`Failed to create question from Metabot response` };
      }

      return {
        cardId: questionId,
        description: description || t`Data exploration`,
      };
    },
    [createQuestion],
  );

  return queryMetabot;
};
