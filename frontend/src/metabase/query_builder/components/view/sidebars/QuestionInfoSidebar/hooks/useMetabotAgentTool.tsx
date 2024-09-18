import { match } from "ts-pattern";
import { useDispatch, useSelector } from "metabase/lib/redux";
import _, { splice } from "underscore";
import {
  onUpdateVisualizationSettings,
  setUIControls,
  updateCardVisualizationSettings,
  updateQuestion,
} from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { findColumnSettingIndexesForColumns } from "metabase-lib/v1/queries/utils/dataset";
import visualizations from "metabase/visualizations";
import { ApplyVisualizationToolCall } from "metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/tool-call-types";

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    // To JSON parse
    arguments: string;
  };
}

function mergeColumns(A: any[], B: any[]) {
  const mergedMap = _.indexBy(A, "name");

  B.forEach(column => {
    mergedMap[column.name] = { ...mergedMap[column.name], ...column };
  });

  return Object.values(mergedMap);
}

function moveColumns(columns: any[], oldIndex: number, newIndex: number) {
  // Ensure the indices are valid
  if (
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= columns.length ||
    newIndex >= columns.length
  ) {
    throw new Error("Invalid index");
  }

  // Create a new array to avoid mutating the original
  const newColumns = [...columns];

  // Remove the item from the old position
  const [movedColumn] = newColumns.splice(oldIndex, 1);

  // Adjust the new index if moving from a higher index to a lower index
  const adjustedNewIndex = oldIndex < newIndex ? newIndex - 1 : newIndex;

  // Insert the item at the new position
  newColumns.splice(adjustedNewIndex, 0, movedColumn);

  return newColumns;
}

/**
 * Dispatches the action according to LLM's specified tools
 */
export function useMetabotAgentTool() {
  const currentQuestion = useSelector(getQuestion);
  const dispatch = useDispatch();

  const runAgentAction = async (toolCall: ToolCall) => {
    const args = JSON.parse(toolCall.function.arguments);

    console.log(`[AI] Tool Call:`, toolCall.function.name);

    const settings = currentQuestion.settings();
    const cardId = currentQuestion.card().source_card_id;
    const columns = settings?.["table.columns"] ?? [];

    return match(toolCall.function.name)
      .with("hideShowColumns", async () => {
        if (!currentQuestion) {
          return;
        }

        const nextColumns = mergeColumns(columns, args.columns);
        console.log(`[AI] hide/show columns:`, { nextColumns });

        await dispatch(
          updateCardVisualizationSettings({ "table.columns": nextColumns }),
        );
      })
      .with("applyVisualization", async () => {
        if (!currentQuestion) {
          return;
        }

        const { display, filters, summarizations, groups } =
          args as ApplyVisualizationToolCall;

        console.log(`[AI] change visualization:`, { args });

        // STEP 1 - Apply filters

        // STEP 2 - Apply summarizations

        // STEP 3 - Apply groupings

        // STEP 4 - Apply visualization settings
        let newQuestion = currentQuestion.setDisplay(display).lockDisplay();

        const visualization = visualizations.get(display);

        if (visualization?.onDisplayUpdate) {
          const updatedSettings = visualization.onDisplayUpdate(
            newQuestion.settings(),
          );

          newQuestion = newQuestion.setSettings(updatedSettings);
        }

        await dispatch(updateQuestion(newQuestion, { shouldUpdateUrl: true }));
        dispatch(setUIControls({ isShowingRawTable: false }));
      })
      .with("moveColumns", async () => {
        if (!currentQuestion) {
          return;
        }

        const nextColumns = moveColumns(columns, args.oldIndex, args.newIndex);
        console.log(`[AI] move column:`, { args, nextColumns });

        await dispatch(
          updateCardVisualizationSettings({ "table.columns": nextColumns }),
        );
      })
      .otherwise(() => {
        console.log(`Unknown action: ${toolCall.function.name}`);
      });
  };

  return { runAgentAction };
}
