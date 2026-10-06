import { EmbeddingSdkMode } from "embedding-sdk-bundle/lib/modes/EmbeddingSdkMode";
import { Mode } from "metabase/querying/click-actions/Mode";
import {
  type ClickAction,
  type ClickActionsMode,
  type ClickObject,
  type CustomClickAction,
  isPopoverClickAction,
  isQuestionChangeClickAction,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { SeriesCard } from "metabase-types/api";

import { type McpDrillOperation, getDrillOperation } from "./derive";

type McpDrillHandler = (
  operation: McpDrillOperation,
  nextCard: SeriesCard | null,
) => void;

/** Drill name -> the result-column name of each dimension it is offered on, in order. */
type McpDrillDimensions = Partial<Record<string, string[]>>;

/** Drills Lib offers once per clicked dimension rather than once per click. */
const PER_DIMENSION_DRILLS = new Set(["zoom-in.binning", "zoom-in.geographic"]);

/**
 * For each drill `question` offers once per dimension of `clicked`, the name
 * of each dimension it acts on, in the order Lib offers them, which is the
 * order of the click actions built from them.
 */
export function getDrillDimensions(
  question: Question,
  clicked: ClickObject,
): McpDrillDimensions {
  const query = question.query();
  const stageIndex = -1;
  const dimensions: McpDrillDimensions = {};

  try {
    const drills = Lib.availableDrillThrus(
      query,
      stageIndex,
      question.id(),
      clicked.column,
      clicked.value,
      clicked.data,
      clicked.dimensions,
    );

    for (const drill of drills) {
      const name = Lib.displayInfo(query, stageIndex, drill).type.replace(
        /^drill-thru\//,
        "",
      );

      if (PER_DIMENSION_DRILLS.has(name)) {
        // Any drill's details carry the column it acts on.
        const { column } = Lib.combineColumnDrillDetails(drill);
        const columnName = Lib.displayInfo(query, stageIndex, column).name;
        dimensions[name] = [...(dimensions[name] ?? []), columnName];
      }
    }
  } catch (error) {
    console.error("Error reading the MCP drill dimensions", error);
  }

  return dimensions;
}

/**
 * The click actions the MCP Apps iframe offers for `clicked`. A drill the
 * server can derive becomes an action that hands its operation to `onDrill`,
 * unless `isChartChanging()` is true: a drill's click comes from the results
 * on screen, and a pending change or a running query is about to replace them.
 * A drill offered once per dimension names its dimension from
 * `drillDimensions`.
 * Any other action that would change the query is dropped, because the iframe
 * never runs a query it built itself. Actions that leave the query alone stay.
 */
export function getMcpClickActions(
  actions: ClickAction[],
  clicked: ClickObject,
  onDrill: McpDrillHandler,
  isChartChanging: () => boolean,
  drillDimensions: McpDrillDimensions,
): ClickAction[] {
  const seenByDrill = new Map<string, number>();

  return actions.flatMap((action): ClickAction[] => {
    if (isPopoverClickAction(action)) {
      return [];
    }

    if (!isQuestionChangeClickAction(action)) {
      return [action];
    }

    // Changes only how the result is shown, such as hiding a column.
    if (action.questionChangeBehavior === "updateQuestion") {
      return [action];
    }

    // The k-th action of a per-dimension drill acts on its k-th dimension.
    const index = seenByDrill.get(action.name) ?? 0;
    seenByDrill.set(action.name, index + 1);
    const dimension = drillDimensions[action.name]?.[index];

    const operation = isChartChanging()
      ? null
      : getDrillOperation(action.name, clicked, dimension);

    if (!operation) {
      return [];
    }

    const derivedAction: CustomClickAction = {
      type: "custom",
      name: action.name,
      title: action.title,
      subTitle: action.subTitle,
      section: action.section,
      sectionTitle: action.sectionTitle,
      sectionDirection: action.sectionDirection,
      icon: action.icon,
      iconText: action.iconText,
      buttonType: action.buttonType,
      tooltip: action.tooltip,
      onClick: ({ closePopover }) => {
        closePopover();
        // Only used to open the drill in Metabase, never to run it here.
        onDrill(operation, action.question().card());
      },
    };

    // A default action, such as a PK or FK drill, runs on click without a popover.
    if ("default" in action && action.default) {
      return [{ ...derivedAction, default: true }];
    }

    return [derivedAction];
  });
}

/**
 * Whether the chart is about to change: a derive is pending, or the question's
 * query is running.
 */
export function isMcpChartChanging(
  pendingDerives: { readonly current: number },
  isQueryRunning: { readonly current: boolean },
): boolean {
  return pendingDerives.current > 0 || isQueryRunning.current;
}

/** The click-action mode for the MCP Apps iframe's question. */
export function createMcpClickActionMode(
  onDrill: McpDrillHandler,
  isChartChanging: () => boolean,
): ClickActionsMode {
  return new Mode(() => EmbeddingSdkMode, {
    mapActions: (actions, clicked, question) =>
      getMcpClickActions(
        actions,
        clicked,
        onDrill,
        isChartChanging,
        getDrillDimensions(question, clicked),
      ),
  });
}
