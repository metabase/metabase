import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";
import { useCreateReportSnapshotMutation } from "metabase-enterprise/api";
import { aiStreamingQuery } from "metabase-enterprise/api/ai-streaming";
import { fetchReportQuestionData } from "metabase-enterprise/reports/reports.slice";

const ENDPOINT = "/api/ee/metabot-v3/v2/agent-streaming"; // TODO: we should get our own endpoint
const EXTRA_PROMPT = ", do not ask me any further clarifying questions";

export const useMetabotReportQuery = () => {
  const dispatch = useDispatch();
  const [createQuestion] = useCreateCardMutation();
  const [createSnapshot] = useCreateReportSnapshotMutation();

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

      // FIXME: get the backend to do all this processing

      const assistantMessage = response?.history?.filter(
        (m) => m.role === "assistant",
      );
      const { content: description } =
        assistantMessage[assistantMessage.length - 1] ??
        t`No response from Metabot`;

      const toolCall = response.history.filter((i) => i.role === "tool");
      const lastTool = toolCall[toolCall.length - 1];
      if (!lastTool) {
        console.error("No tool call found in Metabot response");
        return { description: "No tool call found in Metabot response" };
      }

      const notebookQuery = response.history.find((i) =>
        i?.["tool-calls"]?.some(
          (call) => call.name === "construct_notebook_query",
        ),
      );

      const args = JSON.parse(notebookQuery?.["tool-calls"][0].arguments);
      const vizSettings = args.viz_settings || {};

      // captures text inside triple backticks
      const query = JSON.parse(lastTool.content.match(/```(.*?)```/s)[1]);
      if (!query) {
        return { description: "No query found in Metabot response" };
      }

      const createQuestionResponse = await createQuestion({
        dataset_query: query,
        name: "Ad-hoc exploration",
        type: "question",
        collection_id: 7,
        display: vizSettings.type ?? "table",
        visualization_settings: vizSettings ?? {},
      });

      const questionId = createQuestionResponse.data.id;

      const snapshot = await createSnapshot({
        card_id: questionId,
      }).unwrap();

      dispatch(
        fetchReportQuestionData({
          cardId: snapshot.card_id,
          snapshotId: snapshot.snapshot_id,
        }),
      );

      return {
        cardId: questionId,
        snapshotId: snapshot.snapshot_id,
        title: t`Data exploration`,
        description: description || t`Data exploration`,
      };
    },
    [dispatch, createQuestion, createSnapshot],
  );

  return queryMetabot;
};
