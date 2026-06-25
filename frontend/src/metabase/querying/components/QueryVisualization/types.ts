import type {
  ClickObject,
  VisualizationPassThroughProps,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dataset,
  RawSeries,
  Series,
  TimelineEvent,
  VisualizationSettings,
} from "metabase-types/api";

/**
 * A query result as it lives in the query builder. It's a {@link Dataset} for
 * successful runs, augmented with the `via` error chain and `duration` that the
 * QB attaches to failed runs (see `query_builder/actions/querying`).
 */
export type QueryVisualizationResult = Dataset & {
  via?: Record<string, unknown>[];
  duration?: number;
};

export type QueryVisualizationProps = VisualizationPassThroughProps & {
  className?: string;
  noHeader?: boolean;
  question: Question;
  result?: QueryVisualizationResult | null;
  rawSeries?: RawSeries | null;
  maxTableRows?: number;

  isRunnable?: boolean;
  isRunning?: boolean;
  isResultDirty?: boolean;
  isNativeEditorOpen?: boolean;
  isDirtyStateShownForError?: boolean;
  isDirty?: boolean;
  isShowingSummarySidebar?: boolean;
  hideLegend?: boolean;

  // query-builder-specific props injected by callers via `useVisualizationResultQBProps`
  isRawTable?: boolean;
  scrollToLastColumn?: boolean;
  getExtraDataForClick?: () => Record<string, unknown>;

  timelineEvents?: TimelineEvent[];
  selectedTimelineEventIds?: number[];

  runQuestionQuery?: () => void;
  cancelQuery?: () => void;
  navigateToNewCardInsideQB?: (opts: {
    nextCard: Card;
    previousCard: Card;
    objectId?: number;
  }) => void;
  onNavigateBack?: () => void;
  editSummary?: () => void;

  handleVisualizationClick?: (clicked: ClickObject | null) => void;
  selectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  deselectTimelineEvents?: () => void;
  onOpenChartSettings?: (data: {
    initialChartSettings?: { section: string };
    showSidebarTitle?: boolean;
  }) => void;
  onUpdateQuestion?: (question: Question, opts?: { run?: boolean }) => void;
  onUpdateWarnings?: (warnings: string[]) => void;
  onUpdateVisualizationSettings?: (
    settings: VisualizationSettings,
    question?: Question,
  ) => void;
  onVisualizationRendered?: (series: Series) => void;
};
