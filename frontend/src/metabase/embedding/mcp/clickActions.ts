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
import type { SeriesCard } from "metabase-types/api";

import { type McpDrillOperation, getDrillOperation } from "./derive";

type McpDrillHandler = (
  operation: McpDrillOperation,
  nextCard: SeriesCard | null,
) => void;

/**
 * The click actions the MCP Apps iframe offers for `clicked`. A drill the
 * server can derive becomes an action that hands its operation to `onDrill`,
 * unless `isChartChanging()` is true: a drill's click comes from the results
 * on screen, and a pending change or a running query is about to replace them.
 * Any other action that would change the query is dropped, because the iframe
 * never runs a query it built itself. Actions that leave the query alone stay.
 */
export function getMcpClickActions(
  actions: ClickAction[],
  clicked: ClickObject,
  onDrill: McpDrillHandler,
  isChartChanging: () => boolean,
): ClickAction[] {
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

    const operation = isChartChanging()
      ? null
      : getDrillOperation(action.name, clicked);

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
    mapActions: (actions, clicked) =>
      getMcpClickActions(actions, clicked, onDrill, isChartChanging),
  });
}
