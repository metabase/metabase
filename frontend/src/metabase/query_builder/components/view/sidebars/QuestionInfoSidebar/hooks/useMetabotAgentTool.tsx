import { match } from "ts-pattern";
import { useDispatch, useSelector } from "metabase/lib/redux";
import _ from "underscore";
import {
  onUpdateVisualizationSettings,
  updateCardVisualizationSettings,
  updateQuestion,
} from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { findColumnSettingIndexesForColumns } from "metabase-lib/v1/queries/utils/dataset";

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    // To JSON parse
    arguments: string;
  };
}

function mergeColumns(A: any[], B: any[]): Column[] {
  const mergedMap = _.indexBy(A, "name");

  B.forEach(column => {
    mergedMap[column.name] = { ...mergedMap[column.name], ...column };
  });

  return Object.values(mergedMap);
}

/**
 * Dispatches the action according to LLM's specified tools
 */
export function useMetabotAgentTool() {
  const currentQuestion = useSelector(getQuestion);
  const dispatch = useDispatch();

  const runAgentAction = async (toolCall: ToolCall) => {
    const args = JSON.parse(toolCall.function.arguments);

    console.log(`[AGENT] Tool Call:`, toolCall.function.name);

    return match(toolCall.function.name)
      .with("hideShowColumns", async () => {
        if (!currentQuestion) {
          return;
        }

        const settings = currentQuestion.settings();

        const cardId = currentQuestion.card().source_card_id;
        // const table = currentQuestion.metadata().table(`card__${cardId}`);

        const columns = settings?.["table.columns"] ?? [];
        console.log(`update card viz settings:`, { args, settings, columns });

        const nextColumns = mergeColumns(columns, args.columns);

        await dispatch(
          updateCardVisualizationSettings({ "table.columns": nextColumns }),
        );

        // const nextQuestion = currentQuestion.with;
        //
        // dispatch(
        //   updateQuestion(nextQuestion, {
        //     shouldUpdateUrl: true,
        //     shouldStartAdHocQuestion: false,
        //   }),
        // );
      })
      .with("moveColumns", () => {
        console.log("moveColumns", args);
      })
      .with("applyFilters", () => {
        console.log("applyFilters", args);
      })
      .otherwise(() => {
        console.log(`Unknown action: ${toolCall.function.name}`);
      });
  };

  return { runAgentAction };
}
