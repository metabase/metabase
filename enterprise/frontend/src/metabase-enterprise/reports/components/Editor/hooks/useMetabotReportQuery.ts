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

      // FIXME: get the backend to do all this processing - this is just a hacky prototype
      const assistantMessage = response?.history?.findLast(
        (m) => m.role === "assistant",
      ) ?? {
        content: t`Couldn't make a query from that prompt 😞`,
      };
      const { content: description } = assistantMessage;

      const toolCall = response.history.filter((i) => i.role === "tool");
      const lastTool = toolCall[toolCall.length - 1];
      if (!lastTool) {
        console.error("No tool call found in Metabot response");
        return { error: description };
      }

      const notebookQuery = response.history.find((i) =>
        i?.["tool-calls"]?.some(
          (call: any) => call.name === "construct_notebook_query",
        ),
      );
      let vizSettings: any = {};
      try {
        const args =
          JSON.parse(notebookQuery?.["tool-calls"][0].arguments) || {};
        vizSettings = args.vizSettings ?? {};
      } catch (e) {
        return { error: description };
      }

      // captures text inside triple backticks
      const query = JSON.parse(lastTool.content.match(/```(.*?)```/s)[1]);
      if (!query) {
        return { error: description };
      }

      const createQuestionResponse = await createQuestion({
        dataset_query: query,
        name: "Ad-hoc exploration",
        type: "question",
        collection_id: 624, // WHERE TO SAVE????
        display: vizSettings.type ?? "table",
        visualization_settings: vizSettings ?? {},
      });

      const questionId = createQuestionResponse?.data?.id;

      if (!questionId) {
        return { error: t`Failed to create question from Metabot response` };
      }

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
