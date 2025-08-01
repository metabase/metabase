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

      const navigateTo = response.data.find(
        (d: any) => d.type === "navigate_to",
      );

      if (!navigateTo) {
        return { error: description };
      }

      const encodedQuery = navigateTo?.value?.replace?.("/question#", "");

      let query = {};

      try {
        query = JSON.parse(atob(encodedQuery));
      } catch (e) {
        console.error("Failed to parse query", e, encodedQuery);
        return { error: description };
      }

      if (!query) {
        return { error: description };
      }

      const createQuestionResponse = await createQuestion({
        visualization_settings: {},
        ...(query as any),
        type: "in_document",
        name: "Exploration",
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
