import { match } from "ts-pattern";
import { useDispatch, useSelector } from "metabase/lib/redux";
import _ from "underscore";
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

        const {
          display,
          filters = [],
          summarizations = [],
          groups = [],
        } = args as ApplyVisualizationToolCall;

        console.log(`[AI] change visualization:`, { args });

        // Apply viz type
        let nextQuestion = currentQuestion.setDisplay(display).lockDisplay();

        // Apply filters/summarizations/breakouts/groupings
        const nextQuery = nextQuestion.datasetQuery();
        console.log(`[AI] dataset query:`, { nextQuery });

        const table = currentQuestion
          .metadata()
          .table(currentQuestion.legacyQueryTableId());

        if (nextQuery.type === "query") {
          const aggregation = nextQuery.query.aggregation ?? [];
          const breakout = nextQuery.query.breakout ?? [];

          // Apply filter
          console.log("FILTERS", filters);

          // Apply summarizations/breakouts
          if (Array.isArray(args.summarizations)) {
            for (const summarization of summarizations) {
              if (summarization.metrics === "count") {
                aggregation.push(["count"]);
                continue;
              }

              const { fieldName, metrics } = summarization;

              const field = table?.fields?.find(
                field => field.name === fieldName,
              );

              const fieldRef = [
                "field",
                fieldName,
                { "base-type": field?.base_type },
              ];

              aggregation.push([metrics as any, fieldRef as any]);
            }
          }

          if (Array.isArray(args.groups)) {
            for (const group of args.groups) {
              const { fieldName, granularity } = group;

              const field = table?.fields?.find(
                field => field.name === fieldName,
              );

              const fieldOptions = {
                "base-type": field?.base_type,
                // binning: { strategy: "default" },
              } as any;

              if (field?.base_type === "type/DateTime") {
                fieldOptions["temporal-unit"] = granularity;
              }

              const fieldRef = ["field", fieldName, fieldOptions];
              breakout.push(fieldRef as any);
            }
          }

          // Sync dataset query
          const nextDatasetQuery = {
            ...nextQuery,
            query: {
              ...nextQuery.query,
              aggregation,
              breakout,
            },
          };

          console.log(`[UI] set dataset query`, { nextDatasetQuery });

          nextQuestion = nextQuestion.setDatasetQuery(nextDatasetQuery);
        }

        // Apply viz display settings
        const visualization = visualizations.get(display as string);

        if (visualization?.onDisplayUpdate) {
          const updatedSettings = visualization.onDisplayUpdate(
            nextQuestion.settings(),
          );

          nextQuestion = nextQuestion.setSettings(updatedSettings);
        }

        await dispatch(
          updateQuestion(nextQuestion, { shouldUpdateUrl: true, run: true }),
        );
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
