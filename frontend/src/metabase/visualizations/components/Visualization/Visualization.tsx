/* eslint-disable complexity */
import cx from "classnames";
import React, {
  type CSSProperties,
  type ComponentType,
  type ErrorInfo,
  PureComponent,
  type ReactNode,
  type Ref,
  forwardRef,
} from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { SmallGenericError } from "metabase/common/components/ErrorPages";
import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import type { CardSlownessStatus } from "metabase/dashboard/components/DashCard/types";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { formatNumber } from "metabase/lib/formatting";
import { connect } from "metabase/lib/redux";
import { equals } from "metabase/lib/utils";
import {
  getIsShowingRawTable,
  getUiControls,
} from "metabase/query_builder/selectors";
import { getIsDownloadingToImage } from "metabase/redux/downloads";
import { getTokenFeature } from "metabase/setup/selectors";
import { getFont } from "metabase/styled-components/selectors";
import type { IconName, IconProps } from "metabase/ui";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { Mode } from "metabase/visualizations/click-actions/Mode";
import { getMode } from "metabase/visualizations/click-actions/lib/modes";
import ChartCaption from "metabase/visualizations/components/ChartCaption";
import ChartTooltip from "metabase/visualizations/components/ChartTooltip";
import { ConnectedClickActionsPopover } from "metabase/visualizations/components/ClickActions";
import { performDefaultAction } from "metabase/visualizations/lib/action";
import {
  ChartSettingsError,
  MinRowsError,
} from "metabase/visualizations/lib/errors";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { getCardKey, isSameSeries } from "metabase/visualizations/lib/utils";
import {
  type ClickActionModeGetter,
  type ClickObject,
  type HoveredObject,
  type QueryClickActionsMode,
  type VisualizationDefinition,
  type VisualizationGridSize,
  type VisualizationPassThroughProps,
  type Visualization as VisualizationType,
  isRegularClickAction,
} from "metabase/visualizations/types";
import {
  formatVisualizerClickObject,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import { memoizeClass } from "metabase-lib/v1/utils";
import type {
  Card,
  CardId,
  Dashboard,
  DashboardCard,
  RawSeries,
  Series,
  SingleSeries,
  TimelineEvent,
  VisualizationSettings,
} from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import { EmptyVizState } from "../EmptyVizState";

import ChartSettingsErrorButton from "./ChartSettingsErrorButton";
import { ErrorView } from "./ErrorView";
import LoadingView, { type LoadingViewProps } from "./LoadingView";
import NoResultsView from "./NoResultsView";
import {
  VisualizationActionButtonsContainer,
  VisualizationHeader,
  VisualizationRoot,
  VisualizationSlowSpinner,
} from "./Visualization.styled";
import { VisualizationRenderedWrapper } from "./VisualizationRenderedWrapper";
import { Watermark } from "./Watermark";

type StateDispatchProps = {
  dispatch: Dispatch;
};

type StateProps = {
  hasDevWatermark: boolean;
  fontFamily: string;
  isRawTable: boolean;
  isEmbeddingSdk: boolean;
  scrollToLastColumn: boolean;
  isDownloadingToImage: boolean;
};

type ForwardedRefProps = {
  forwardedRef: Ref<HTMLDivElement>;
};

type OnChangeCardAndRunOpts = {
  nextCard: Card;
  previousCard: Card;
  objectId?: number;
};

type VisualizationOwnProps = {
  actionButtons?: ReactNode | null;
  className?: string;
  dashboard?: Dashboard;
  dashcard?: DashboardCard;
  error?: ReactNode;
  errorIcon?: IconName;
  errorMessageOverride?: string;
  expectedDuration?: number;
  getExtraDataForClick?: (
    clicked: ClickObject | null,
  ) => Record<string, unknown>;
  getHref?: () => string | undefined;
  gridSize?: VisualizationGridSize;
  gridUnit?: number;
  handleVisualizationClick?: (clicked: ClickObject | null) => void;
  headerIcon?: IconProps;
  width?: number | null;
  height?: number | null;
  isAction?: boolean;
  isDashboard?: boolean;
  isDocument?: boolean;
  isMobile?: boolean;
  isRunning?: boolean;
  isShowingSummarySidebar?: boolean;
  isSlow?: CardSlownessStatus;
  isVisible?: boolean;
  renderLoadingView?: (props: LoadingViewProps) => JSX.Element | null;
  metadata?: Metadata;
  mode?: ClickActionModeGetter | Mode | QueryClickActionsMode;
  onEditSummary?: () => void;
  rawSeries?: (
    | SingleSeries
    | {
        card: Card;
      }
  )[];
  visualizerRawSeries?: RawSeries;
  replacementContent?: JSX.Element | null;
  selectedTimelineEventIds?: number[];
  settings?: VisualizationSettings;
  showTitle?: boolean;
  showWarnings?: boolean;
  style?: CSSProperties;
  timelineEvents?: TimelineEvent[];
  tc?: ContentTranslationFunction;
  zoomedRowIndex?: number;
  onOpenChartSettings?: (data: {
    initialChartSettings: { section: string };
    showSidebarTitle?: boolean;
  }) => void;
  onChangeCardAndRun?: ((opts: OnChangeCardAndRunOpts) => void) | null;
  onHeaderColumnReorder?: (columnName: string) => void;
  onChangeLocation?: (location: Location) => void;
  onUpdateQuestion?: () => void;
  onUpdateVisualizationSettings?: (
    settings: VisualizationSettings,
    question?: Question,
  ) => void;
  onUpdateWarnings?: (warnings: string[]) => void;
  onVisualizationRendered?: (series: Series) => void;
} & VisualizationPassThroughProps;

type VisualizationProps = StateDispatchProps &
  StateProps &
  ForwardedRefProps &
  VisualizationOwnProps;

type VisualizationState = {
  clicked: ClickObject | null;
  computedSettings: Record<string, string>;
  error: ReactNode;
  genericError: ErrorInfo | null;
  getHref: (() => string) | undefined;
  hovered: HoveredObject | null;
  series: Series | null;
  visualization: VisualizationDefinition | null;
  warnings: string[];
  _lastProps?: VisualizationProps;
  isNativeView: boolean;
};

const mapStateToProps = (state: State): StateProps => ({
  hasDevWatermark: getTokenFeature(state, "development_mode"),
  fontFamily: getFont(state),
  isRawTable: getIsShowingRawTable(state),
  isEmbeddingSdk: isEmbeddingSdk(),
  scrollToLastColumn: getUiControls(state)?.scrollToLastColumn,
  isDownloadingToImage: getIsDownloadingToImage(state),
});

const SMALL_CARD_WIDTH_THRESHOLD = 150;

const isLoading = (series: Series | null) => {
  return !(
    series &&
    series.length > 0 &&
    _.every(
      series,
      (s) => !!s.data || _.isObject(s.card.visualization_settings.virtual_card),
    )
  );
};

const deriveStateFromProps = (props: VisualizationProps) => {
  const rawSeriesArray = props.rawSeries || [];
  const firstCard = rawSeriesArray[0]?.card;
  const firstQuestion = firstCard != null ? new Question(firstCard) : undefined;
  const isNativeView =
    props.queryBuilderMode === "view" && firstQuestion?.isNative();

  const transformed = props.rawSeries
    ? getVisualizationTransformed(
        extractRemappings(props.rawSeries as RawSeries),
      )
    : null;

  const series = transformed?.series ?? null;

  const computedSettings = !isLoading(series)
    ? getComputedSettingsForSeries(series)
    : {};

  return {
    series,
    computedSettings,
    visualization: transformed?.visualization,
    isNativeView,
  };
};

class Visualization extends PureComponent<
  VisualizationProps,
  VisualizationState
> {
  private _resetHoverTimer: number | null = null;

  static defaultProps = {
    height: 0,
    isAction: false,
    isDashboard: false,
    isDocument: false,
    isEditing: false,
    isEmbeddingSdk: false,
    isFullscreen: false,
    isPreviewing: false,
    isQueryBuilder: false,
    isSettings: false,
    showTitle: false,
    width: 0,
    // prefer passing in a function that doesn't cause the application to reload
    onChangeLocation: (location: Location) => {
      window.location = location as any;
    },
  };

  constructor(props: VisualizationProps) {
    super(props);

    this.state = {
      clicked: null,
      computedSettings: {},
      error: null,
      genericError: null,
      getHref: undefined,
      hovered: null,
      series: null,
      visualization: null,
      warnings: [],
      isNativeView: false,
    };
  }

  static getDerivedStateFromProps(
    props: VisualizationProps,
    state: VisualizationState,
  ) {
    // When these props has changed, we need to re-derive the state.
    // getDerivedStateFromProps does not have access to the last props, so
    if (
      !isSameSeries(props.rawSeries, state._lastProps?.rawSeries) ||
      !equals(props.settings, state._lastProps?.settings) ||
      !equals(props.timelineEvents, state._lastProps?.timelineEvents) ||
      !equals(
        props.selectedTimelineEventIds,
        state._lastProps?.selectedTimelineEventIds,
      )
    ) {
      return {
        ...deriveStateFromProps(props),

        // Reset the state to its initial values when these props have changed
        hovered: null,
        error: null,
        genericError: null,
        warnings: [],

        // Store last properties to compare with the next call
        _lastProps: _.pick(props, [
          "rawSeries",
          "settings",
          "timelineEvents",
          "selectedTimelineEventIds",
        ]),
      };
    }

    // Do not alter the state if the above props have not changed
    return null;
  }

  componentDidUpdate(
    prevProps: VisualizationProps,
    prevState: VisualizationState,
  ) {
    if (!equals(this.getWarnings(prevProps, prevState), this.getWarnings())) {
      this.updateWarnings();
    }
  }

  componentDidMount() {
    this.updateWarnings();
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error caught in <Visualization>", error, info);
    this.setState({
      error: "An error occurred displaying this visualization.",
    });
  }

  getWarnings(props: VisualizationProps = this.props, state = this.state) {
    const { rawSeries = [] } = props;

    let warnings = state.warnings || [];
    if (
      state.series &&
      state.series[0].card.display !== "table" &&
      state.series[0].card.display !== "list"
    ) {
      warnings = warnings.concat(
        rawSeries
          .filter(
            (s): s is SingleSeries =>
              "data" in s && s.data && s.data.rows_truncated != null,
          )
          .map(
            (s) =>
              t`Data truncated to ${formatNumber(s.data.rows_truncated)} rows.`,
          ),
      );
    }
    return warnings;
  }

  updateWarnings() {
    if (this.props.onUpdateWarnings) {
      this.props.onUpdateWarnings(this.getWarnings() || []);
    }
  }

  handleHoverChange = (hovered: HoveredObject | null | undefined) => {
    if (hovered) {
      this.setState({ hovered });
      // If we previously set a timeout for clearing the hover clear it now since we received
      // a new hover.
      if (this._resetHoverTimer !== null) {
        clearTimeout(this._resetHoverTimer);
        this._resetHoverTimer = null;
      }
    } else {
      // When resetting the hover wait in case we're simply transitioning from one
      // element to another. This allows visualizations to use mouseleave events etc.
      this._resetHoverTimer = window.setTimeout(() => {
        this.setState({ hovered: null });
        this._resetHoverTimer = null;
      }, 0);
    }
  };

  private static getQuestionForCard(
    metadata: Metadata | undefined,
    card: Card | undefined,
  ) {
    return !!card && !!metadata ? new Question(card, metadata) : undefined;
  }

  _getClickActionsCached(
    clickedObject: ClickObject | null | undefined,
    mode: ClickActionModeGetter | Mode | QueryClickActionsMode | undefined,
    computedSettings: Record<string, string>,
    dashcard?: DashboardCard,
    metadata?: Metadata,
    rawSeries: (
      | SingleSeries
      | {
          card: Card;
        }
    )[] = [],
    visualizerRawSeries: RawSeries = [],
    isRawTable = false,
    getExtraDataForClick: (
      clicked: ClickObject | null,
    ) => Record<string, unknown> = () => ({}),
  ) {
    if (!clickedObject) {
      return [];
    }

    const clicked = isVisualizerDashboardCard(dashcard)
      ? formatVisualizerClickObject(
          clickedObject,
          visualizerRawSeries,
          dashcard.visualization_settings.visualization.columnValuesMapping,
        )
      : clickedObject;

    const card = Visualization.findCardById(
      clicked.cardId,
      dashcard,
      rawSeries,
      visualizerRawSeries,
    );
    const question = Visualization.getQuestionForCard(metadata, card);
    const modeInstance = Visualization.getMode(mode, question);

    return modeInstance
      ? modeInstance.actionsForClick(
          {
            ...clicked,
            extraData: {
              ...getExtraDataForClick(clicked),
              isRawTable,
            },
          },
          computedSettings,
        )
      : [];
  }

  private static getMode(
    modeOrModeGetter:
      | ClickActionModeGetter
      | Mode
      | QueryClickActionsMode
      | undefined,
    question: Question | undefined,
  ) {
    const modeOrQueryMode =
      typeof modeOrModeGetter === "function"
        ? question
          ? modeOrModeGetter({ question })
          : null
        : modeOrModeGetter;

    if (modeOrQueryMode instanceof Mode) {
      return modeOrQueryMode;
    }

    if (question && modeOrQueryMode) {
      return new Mode(question, modeOrQueryMode);
    }

    if (question) {
      return getMode(question);
    }
  }

  getClickActions(clickedObject?: ClickObject | null) {
    const {
      mode,
      dashcard,
      metadata,
      rawSeries,
      visualizerRawSeries,
      isRawTable,
      getExtraDataForClick,
    } = this.props;

    const { computedSettings } = this.state;

    return this._getClickActionsCached(
      clickedObject,
      mode,
      computedSettings,
      dashcard,
      metadata,
      rawSeries,
      visualizerRawSeries,
      isRawTable,
      getExtraDataForClick,
    );
  }

  private static findCardById(
    cardId?: CardId | null,
    dashcard?: DashboardCard,
    rawSeries: (
      | SingleSeries
      | {
          card: Card;
        }
    )[] = [],
    visualizerRawSeries: RawSeries = [],
  ) {
    const isVisualizerViz = isVisualizerDashboardCard(dashcard);
    const lookupSeries = isVisualizerViz ? visualizerRawSeries : rawSeries;
    return (
      lookupSeries.find((series) => series.card.id === cardId)?.card ??
      lookupSeries[0].card
    );
  }

  getNormalizedSizes = () => {
    const { width, height } = this.props;

    return {
      width: width ?? 0,
      height: height ?? 0,
    };
  };

  visualizationIsClickable = (clicked: ClickObject | null) => {
    if (!clicked) {
      return false;
    }

    try {
      return this.getClickActions(clicked).length > 0;
    } catch (e) {
      console.warn(e);
      return false;
    }
  };

  handleVisualizationClick = (clicked: ClickObject | null) => {
    const { handleVisualizationClick } = this.props;

    if (typeof handleVisualizationClick === "function") {
      handleVisualizationClick(clicked);
      return;
    }

    const didPerformDefaultAction = performDefaultAction(
      this.getClickActions(clicked),
      {
        dispatch: this.props.dispatch,
        onChangeCardAndRun: this.handleOnChangeCardAndRun,
      },
    );

    if (didPerformDefaultAction) {
      return;
    }

    // needs to be delayed so we don't clear it when switching from one drill through to another
    setTimeout(() => {
      this.setState({ clicked });
    }, 100);
  };

  // Add the underlying card of current series to onChangeCardAndRun if available
  handleOnChangeCardAndRun = ({
    nextCard,
    objectId,
  }: Pick<OnChangeCardAndRunOpts, "nextCard" | "objectId">) => {
    const { dashcard, rawSeries, visualizerRawSeries, onChangeCardAndRun } =
      this.props;

    onChangeCardAndRun?.({
      previousCard: Visualization.findCardById(
        nextCard?.id,
        dashcard,
        rawSeries,
        visualizerRawSeries,
      ),
      nextCard,
      objectId,
    });
  };

  onRender = ({ warnings = [] }: { warnings?: string[] } = {}) => {
    const currentWarnings = this.state.warnings;
    if (!_.isEqual(currentWarnings, warnings)) {
      // using requestAnimationFrame to avoid setting state in render
      requestAnimationFrame(() => this.setState({ warnings }));
    }
  };

  onRenderError = (error: string | undefined) => {
    console.error(error);
    this.setState({ error });
  };

  onErrorBoundaryError = (genericError: ErrorInfo) => {
    this.setState({ genericError });
  };

  hideActions = () => {
    if (this.state.clicked !== null) {
      this.setState({ clicked: null });
    }
  };

  handleVisualizationRendered = () => {
    const { series } = this.state;
    if (series) {
      this.props.onVisualizationRendered?.(series);
    }
  };

  render() {
    const {
      actionButtons,
      canToggleSeriesVisibility,
      className,
      dashboard,
      dashcard,
      dispatch,
      errorIcon,
      errorMessageOverride,
      expectedDuration,
      fontFamily,
      getExtraDataForClick,
      getHref,
      hasDevWatermark,
      headerIcon,
      height: rawHeight,
      isAction,
      isDashboard,
      isDocument,
      isEditing,
      isEmbeddingSdk,
      isFullscreen,
      isMobile,
      isObjectDetail,
      isPreviewing,
      isRawTable,
      isQueryBuilder,
      isRunning,
      isSettings,
      isShowingDetailsOnlyColumns,
      isShowingSummarySidebar,
      isSlow,
      isDownloadingToImage,
      metadata,
      mode,
      onEditSummary,
      queryBuilderMode,
      rawSeries = [],
      isSelectable,
      rowChecked,
      onAllSelectClick,
      onRowSelectClick,
      visualizerRawSeries,
      renderEmptyMessage,
      renderLoadingView = LoadingView,
      renderTableHeader,
      replacementContent,
      scrollToColumn,
      scrollToLastColumn,
      selectedTimelineEventIds,
      showAllLegendItems,
      showTitle,
      style,
      tableHeaderHeight,
      timelineEvents,
      totalNumGridCols,
      width: rawWidth,
      onDeselectTimelineEvents,
      onOpenChartSettings,
      onOpenTimelines,
      onSelectTimelineEvents,
      onTogglePreviewing,
      onUpdateVisualizationSettings = () => {},
      onUpdateWarnings,
      titleMenuItems,
      zoomedRowIndex,
      tableFooterExtraButtons,
    } = this.props;
    const { width, height } = this.getNormalizedSizes();

    const { genericError, visualization, isNativeView } = this.state;
    const small = width < SMALL_CARD_WIDTH_THRESHOLD;

    // these may be overridden below
    let { series, hovered, clicked } = this.state;

    const clickActions = this.getClickActions(clicked);
    const regularClickActions = clickActions.filter(isRegularClickAction);

    // disable hover when click action is active
    if (clickActions.length > 0) {
      hovered = null;
    }

    // disable hover when exporting chart as an image (png download)
    if (isDownloadingToImage) {
      hovered = null;
    }

    let error = this.props.error || this.state.error;
    let noResults = false;
    let isPlaceholder = false;
    const loading = isLoading(series);

    // don't try to load settings unless data is loaded
    const settings = this.props.settings || this.state.computedSettings;

    if (!loading && !error) {
      if (!visualization) {
        error = t`Could not find visualization`;
      } else {
        try {
          if (visualization.checkRenderable && series) {
            visualization.checkRenderable(series, settings);
          }
        } catch (e: unknown) {
          error =
            (e as Error).message ||
            t`Could not display this chart with this data.`;
          if (
            e instanceof ChartSettingsError &&
            visualization?.hasEmptyState &&
            !isDashboard &&
            // For the SDK the EmptyVizState component in some cases (a small container) looks really weird,
            // so at least temporarily we don't display it when rendered in the SDK.
            !isEmbeddingSdk
          ) {
            // hide the error and display the empty state instead
            error = null;
            isPlaceholder = true;
          } else if (e instanceof ChartSettingsError && onOpenChartSettings) {
            error = (
              <ChartSettingsErrorButton
                message={error}
                buttonLabel={e.buttonText}
                onClick={() =>
                  onOpenChartSettings({ initialChartSettings: e.initial })
                }
              />
            );
          } else if (e instanceof MinRowsError) {
            noResults = true;
          }
        }
      }
    }

    if (!error && !genericError && series) {
      noResults = _.every(
        series,
        (s) => s && s.data && datasetContainsNoResults(s.data),
      );
    }

    const extra = (
      <VisualizationActionButtonsContainer>
        {isSlow && !loading && (
          <VisualizationSlowSpinner
            className={DashboardS.VisualizationSlowSpinner}
            size={18}
            isUsuallySlow={isSlow === "usually-slow"}
          />
        )}
        {actionButtons}
      </VisualizationActionButtonsContainer>
    );

    let { gridSize, gridUnit } = this.props;
    if (
      !gridSize &&
      gridUnit &&
      // Check that width/height are set. If they're not, we want to pass
      // undefined rather than {width: 0, height: 0}. Passing 0 will hide axes.
      width != null &&
      height != null
    ) {
      gridSize = {
        width: Math.round(width / (gridUnit * 4)),
        height: Math.round(height / (gridUnit * 3)),
      };
    }

    const CardVisualization = visualization as VisualizationType;

    const isVisualizerViz = isVisualizerDashboardCard(dashcard);

    const title = settings["card.title"];
    const hasHeaderContent = title || extra;
    const isHeaderEnabled = !(visualization && visualization.noHeader);

    const hasHeader =
      (showTitle &&
        hasHeaderContent &&
        (loading || error || noResults || isHeaderEnabled)) ||
      (replacementContent && (dashcard?.size_y !== 1 || isMobile) && !isAction);

    // We can't navigate a user to a particular card from a visualizer viz,
    // so title selection is disabled in this case
    const canSelectTitle =
      this.props.onChangeCardAndRun &&
      !replacementContent &&
      (!isVisualizerViz || React.Children.count(titleMenuItems) === 1);

    return (
      <ErrorBoundary
        onError={this.onErrorBoundaryError}
        ref={this.props.forwardedRef}
      >
        <VisualizationRoot
          className={className}
          style={style}
          data-testid="visualization-root"
          // `getUiName` should be defined (and is a required field on the TS type), but because we have javascript
          // files about visualizations, it's best if we don't risk crashing the app, hence the `?.()`
          data-viz-ui-name={visualization?.getUiName?.()}
          ref={this.props.forwardedRef}
        >
          {!!hasHeader && (
            <VisualizationHeader>
              <ChartCaption
                series={series}
                visualizerRawSeries={visualizerRawSeries}
                settings={settings}
                icon={headerIcon}
                actionButtons={extra}
                hasInfoTooltip={!isDashboard || !isEditing}
                titleMenuItems={titleMenuItems}
                width={width}
                getHref={getHref}
                onChangeCardAndRun={
                  canSelectTitle ? this.handleOnChangeCardAndRun : null
                }
              />
            </VisualizationHeader>
          )}
          {replacementContent ? (
            replacementContent
          ) : isDashboard && noResults ? (
            <NoResultsView isSmall={small} />
          ) : error && !isRunning ? (
            <ErrorView
              error={errorMessageOverride ?? error}
              icon={errorIcon}
              isSmall={small}
              isDashboard={!!isDashboard}
            />
          ) : genericError ? (
            <SmallGenericError bordered={false} />
          ) : loading ? (
            renderLoadingView({
              expectedDuration,
              isSlow,
            })
          ) : isPlaceholder ? (
            <EmptyVizState
              chartType={visualization?.identifier}
              isSummarizeSidebarOpen={isShowingSummarySidebar}
              onEditSummary={isDashboard ? undefined : onEditSummary}
              isNativeView={isNativeView}
            />
          ) : (
            series && (
              <div
                data-card-key={getCardKey(series[0].card?.id)}
                className={cx(CS.flex, CS.flexColumn, CS.flexFull)}
                style={{ position: hasDevWatermark ? "relative" : undefined }}
              >
                <VisualizationRenderedWrapper
                  onRendered={this.handleVisualizationRendered}
                >
                  <CardVisualization
                    actionButtons={actionButtons}
                    // NOTE: CardVisualization class used as a selector for tests
                    className={cx(
                      "CardVisualization",
                      CS.flexFull,
                      CS.flexBasisNone,
                    )}
                    card={series[0].card} // convenience for single-series visualizations
                    canToggleSeriesVisibility={canToggleSeriesVisibility}
                    clicked={clicked}
                    data={series[0].data} // convenience for single-series visualizations
                    dashboard={dashboard}
                    dashcard={dashcard}
                    dispatch={dispatch}
                    errorIcon={errorIcon}
                    fontFamily={fontFamily}
                    getExtraDataForClick={getExtraDataForClick}
                    getHref={getHref}
                    gridSize={gridSize}
                    headerIcon={hasHeader ? null : headerIcon}
                    height={rawHeight}
                    hovered={hovered}
                    isDashboard={!!isDashboard}
                    isDocument={!!isDocument}
                    isEditing={!!isEditing}
                    isEmbeddingSdk={isEmbeddingSdk}
                    isFullscreen={!!isFullscreen}
                    isMobile={!!isMobile}
                    isVisualizerViz={isVisualizerViz}
                    isObjectDetail={isObjectDetail}
                    isPreviewing={isPreviewing}
                    isRawTable={isRawTable}
                    isQueryBuilder={!!isQueryBuilder}
                    isSettings={!!isSettings}
                    isShowingDetailsOnlyColumns={isShowingDetailsOnlyColumns}
                    scrollToLastColumn={scrollToLastColumn}
                    metadata={metadata}
                    mode={mode}
                    queryBuilderMode={queryBuilderMode}
                    rawSeries={rawSeries as RawSeries}
                    visualizerRawSeries={visualizerRawSeries}
                    renderEmptyMessage={renderEmptyMessage}
                    renderTableHeader={renderTableHeader}
                    scrollToColumn={scrollToColumn}
                    selectedTimelineEventIds={selectedTimelineEventIds}
                    series={series}
                    settings={settings}
                    showAllLegendItems={showAllLegendItems}
                    showTitle={!!showTitle}
                    tableHeaderHeight={tableHeaderHeight}
                    timelineEvents={timelineEvents}
                    totalNumGridCols={totalNumGridCols}
                    visualizationIsClickable={this.visualizationIsClickable}
                    width={rawWidth}
                    zoomedRowIndex={zoomedRowIndex}
                    onActionDismissal={this.hideActions}
                    onChangeCardAndRun={
                      this.props.onChangeCardAndRun
                        ? this.handleOnChangeCardAndRun
                        : null
                    }
                    onDeselectTimelineEvents={onDeselectTimelineEvents}
                    onHoverChange={this.handleHoverChange}
                    onOpenTimelines={onOpenTimelines}
                    onRender={this.onRender}
                    onRenderError={this.onRenderError}
                    onSelectTimelineEvents={onSelectTimelineEvents}
                    onTogglePreviewing={onTogglePreviewing}
                    onUpdateVisualizationSettings={
                      onUpdateVisualizationSettings
                    }
                    onUpdateWarnings={onUpdateWarnings}
                    onVisualizationClick={this.handleVisualizationClick}
                    onHeaderColumnReorder={this.props.onHeaderColumnReorder}
                    titleMenuItems={hasHeader ? undefined : titleMenuItems}
                    tableFooterExtraButtons={tableFooterExtraButtons}
                    // These props are only used by the table on the Erroring Questions admin page
                    isSelectable={isSelectable}
                    rowChecked={rowChecked}
                    onAllSelectClick={onAllSelectClick}
                    onRowSelectClick={onRowSelectClick}
                  />
                </VisualizationRenderedWrapper>
                {hasDevWatermark && <Watermark card={series[0].card} />}
              </div>
            )
          )}
          <ChartTooltip hovered={hovered} settings={settings} />
          {this.props.onChangeCardAndRun && (
            <ConnectedClickActionsPopover
              clicked={clicked}
              clickActions={regularClickActions}
              onChangeCardAndRun={this.handleOnChangeCardAndRun}
              onUpdateQuestion={this.props.onUpdateQuestion}
              onClose={this.hideActions}
              series={series}
              onUpdateVisualizationSettings={onUpdateVisualizationSettings}
            />
          )}
        </VisualizationRoot>
      </ErrorBoundary>
    );
  }
}

const VisualizationMemoized = memoizeClass<Visualization>(
  "_getClickActionsCached",
)(Visualization);

// eslint-disable-next-line import/no-default-export
export default _.compose(
  connect(mapStateToProps),
  ExplicitSize<VisualizationProps>({
    selector: ".CardVisualization",
    refreshMode: (props) => (props.isVisible ? "throttle" : "debounceLeading"),
  }),
)(
  forwardRef<HTMLDivElement, VisualizationProps>(
    function VisualizationForwardRef(props, ref) {
      return <VisualizationMemoized {...props} forwardedRef={ref} />;
    },
  ),
) as ComponentType<VisualizationOwnProps>;
