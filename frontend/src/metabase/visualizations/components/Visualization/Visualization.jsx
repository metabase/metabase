/* eslint-disable react/prop-types */
import { PureComponent } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { assoc } from "icepick";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { formatNumber } from "metabase/lib/formatting";
import Utils from "metabase/lib/utils";

import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";
import ChartCaption from "metabase/visualizations/components/ChartCaption";
import ChartTooltip from "metabase/visualizations/components/ChartTooltip";
import { ConnectedChartClickActions } from "metabase/visualizations/components/ChartClickActions";

import { performDefaultAction } from "metabase/visualizations/lib/action";
import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { isSameSeries, getCardKey } from "metabase/visualizations/lib/utils";

import { getMode } from "metabase/modes/lib/modes";
import { getFont } from "metabase/styled-components/selectors";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isRegularClickAction } from "metabase/modes/types";
import Question from "metabase-lib/Question";
import Mode from "metabase-lib/Mode";
import { datasetContainsNoResults } from "metabase-lib/queries/utils/dataset";
import { memoizeClass } from "metabase-lib/utils";

import ChartSettingsErrorButton from "./ChartSettingsErrorButton";
import ErrorView from "./ErrorView";
import LoadingView from "./LoadingView";
import NoResultsView from "./NoResultsView";
import {
  VisualizationRoot,
  VisualizationHeader,
  VisualizationActionButtonsContainer,
  VisualizationSlowSpinner,
} from "./Visualization.styled";

const defaultProps = {
  showTitle: false,
  isDashboard: false,
  isEditing: false,
  isSettings: false,
  isQueryBuilder: false,
  onUpdateVisualizationSettings: () => {},
  // prefer passing in a function that doesn't cause the application to reload
  onChangeLocation: location => {
    window.location = location;
  },
};

const mapStateToProps = state => ({
  fontFamily: getFont(state),
});

class Visualization extends PureComponent {
  state = {
    hovered: null,
    clicked: null,
    error: null,
    warnings: [],
    yAxisSplit: null,
    series: null,
    visualization: null,
    computedSettings: {},
  };

  UNSAFE_componentWillMount() {
    this.transform(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    if (
      !isSameSeries(newProps.rawSeries, this.props.rawSeries) ||
      !Utils.equals(newProps.settings, this.props.settings) ||
      !Utils.equals(newProps.timelineEvents, this.props.timelineEvents) ||
      !Utils.equals(
        newProps.selectedTimelineEventIds,
        this.props.selectedTimelineEventIds,
      )
    ) {
      this.transform(newProps);
    }
  }

  componentDidMount() {
    this.updateWarnings();
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      !Utils.equals(this.getWarnings(prevProps, prevState), this.getWarnings())
    ) {
      this.updateWarnings();
    }
  }

  componentDidCatch(error, info) {
    console.error("Error caught in <Visualization>", error, info);
    this.setState({
      error: new Error("An error occurred displaying this visualization."),
    });
  }

  getWarnings(props = this.props, state = this.state) {
    let warnings = state.warnings || [];
    if (state.series && state.series[0].card.display !== "table") {
      warnings = warnings.concat(
        props.rawSeries
          .filter(s => s.data && s.data.rows_truncated != null)
          .map(
            s =>
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

  transform(newProps) {
    const transformed = newProps.rawSeries
      ? getVisualizationTransformed(extractRemappings(newProps.rawSeries))
      : null;
    const series = transformed && transformed.series;
    const visualization = transformed && transformed.visualization;
    const computedSettings = !this.isLoading(series)
      ? getComputedSettingsForSeries(series)
      : {};
    this.setState({
      hovered: null,
      error: null,
      warnings: [],
      yAxisSplit: null,
      series: series,
      visualization: visualization,
      computedSettings: computedSettings,
    });
  }

  isLoading = series => {
    return !(
      series &&
      series.length > 0 &&
      _.every(
        series,
        s => s.data || _.isObject(s.card.visualization_settings.virtual_card),
      )
    );
  };

  handleHoverChange = hovered => {
    if (hovered) {
      const { yAxisSplit } = this.state;
      // if we have Y axis split info then find the Y axis index (0 = left, 1 = right)
      if (yAxisSplit) {
        const axisIndex = _.findIndex(yAxisSplit, indexes =>
          _.contains(indexes, hovered.index),
        );
        hovered = assoc(hovered, "axisIndex", axisIndex);
      }
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
      this._resetHoverTimer = setTimeout(() => {
        this.setState({ hovered: null });
        this._resetHoverTimer = null;
      }, 0);
    }
  };

  _getQuestionForCardCached(metadata, card) {
    if (!metadata || !card) {
      return;
    }
    const { isQueryBuilder, queryBuilderMode } = this.props;
    const question = new Question(card, metadata);

    // Datasets in QB should behave as raw tables opened in simple mode
    // composeDataset replaces the dataset_query with a clean query using the dataset as a source table
    // Ideally, this logic should happen somewhere else
    return question.isDataset() &&
      isQueryBuilder &&
      queryBuilderMode !== "dataset"
      ? question.composeDataset()
      : question;
  }

  getMode(maybeModeOrQueryMode, question) {
    if (maybeModeOrQueryMode instanceof Mode) {
      return maybeModeOrQueryMode;
    }

    if (question && maybeModeOrQueryMode) {
      return new Mode(question, maybeModeOrQueryMode);
    }

    if (question) {
      return getMode(question);
    }
  }

  getClickActions(clicked) {
    if (!clicked) {
      return [];
    }
    const { metadata, getExtraDataForClick = () => ({}) } = this.props;

    const seriesIndex = clicked.seriesIndex || 0;
    const card = this.state.series[seriesIndex].card;
    const question = this._getQuestionForCardCached(metadata, card);
    const mode = this.getMode(this.props.mode, question);

    return mode
      ? mode.actionsForClick(
          { ...clicked, extraData: getExtraDataForClick(clicked) },
          {},
        )
      : [];
  }

  visualizationIsClickable = clicked => {
    const { onChangeCardAndRun } = this.props;
    if (!onChangeCardAndRun) {
      return false;
    }
    try {
      return this.getClickActions(clicked).length > 0;
    } catch (e) {
      console.warn(e);
      return false;
    }
  };

  handleVisualizationClick = clicked => {
    const { handleVisualizationClick } = this.props;

    if (clicked) {
      MetabaseAnalytics.trackStructEvent(
        "Actions",
        "Clicked",
        `${clicked.column ? "column" : ""} ${clicked.value ? "value" : ""} ${
          clicked.dimensions ? "dimensions=" + clicked.dimensions.length : ""
        }`,
      );
    }

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
  handleOnChangeCardAndRun = ({ nextCard, seriesIndex, objectId }) => {
    const { series, clicked } = this.state;

    const index = seriesIndex || (clicked && clicked.seriesIndex) || 0;
    const previousCard = series && series[index] && series[index].card;

    this.props.onChangeCardAndRun({ nextCard, previousCard, objectId });
  };

  onRender = ({ yAxisSplit, warnings = [] } = {}) => {
    this.setState({ yAxisSplit, warnings });
  };

  onRenderError = error => {
    console.error(error);
    this.setState({ error });
  };

  hideActions = () => {
    if (this.state.clicked !== null) {
      this.setState({ clicked: null });
    }
  };

  render() {
    const {
      actionButtons,
      className,
      dashcard,
      showTitle,
      isDashboard,
      width,
      height,
      headerIcon,
      errorIcon,
      isSlow,
      isMobile,
      expectedDuration,
      replacementContent,
      onOpenChartSettings,
      onUpdateVisualizationSettings,
    } = this.props;
    const { visualization } = this.state;
    const small = width < 330;

    // these may be overridden below
    let { series, hovered, clicked } = this.state;
    let { style } = this.props;

    const clickActions = this.getClickActions(clicked);
    const regularClickActions = clickActions.filter(isRegularClickAction);
    // disable hover when click action is active
    if (clickActions.length > 0) {
      hovered = null;
    }

    let error = this.props.error || this.state.error;
    let noResults = false;
    let isPlaceholder = false;
    const loading = this.isLoading(series);

    // don't try to load settings unless data is loaded
    let settings = this.props.settings || {};

    if (!loading && !error) {
      settings = this.props.settings || this.state.computedSettings;
      if (!visualization) {
        error = t`Could not find visualization`;
      } else {
        try {
          if (visualization.checkRenderable) {
            visualization.checkRenderable(series, settings, this.props.query);
          }
        } catch (e) {
          error = e.message || t`Could not display this chart with this data.`;
          if (
            e instanceof ChartSettingsError &&
            visualization.placeholderSeries &&
            !isDashboard
          ) {
            // hide the error and replace series with the placeholder series
            error = null;
            series = visualization.placeholderSeries;
            settings = getComputedSettingsForSeries(series);
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

    if (!error) {
      noResults = _.every(
        series,
        s => s && s.data && datasetContainsNoResults(s.data),
      );
    }

    const extra = (
      <VisualizationActionButtonsContainer>
        {isSlow && !loading && (
          <VisualizationSlowSpinner
            className="Visualization-slow-spinner"
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

    if (isPlaceholder) {
      hovered = null;
      style = {
        ...style,
        opacity: 0.2,
        filter: "grayscale()",
        pointerEvents: "none",
      };
    }

    const CardVisualization = visualization;

    const title = settings["card.title"];
    const hasHeaderContent = title || extra;
    const isHeaderEnabled = !(visualization && visualization.noHeader);

    const hasHeader =
      (showTitle &&
        hasHeaderContent &&
        (loading || error || noResults || isHeaderEnabled)) ||
      (replacementContent && (dashcard.size_y !== 1 || isMobile));

    return (
      <ErrorBoundary>
        <VisualizationRoot className={className} style={style}>
          {!!hasHeader && (
            <VisualizationHeader>
              <ChartCaption
                series={series}
                settings={settings}
                icon={headerIcon}
                actionButtons={extra}
                onChangeCardAndRun={
                  this.props.onChangeCardAndRun && !replacementContent
                    ? this.handleOnChangeCardAndRun
                    : null
                }
              />
            </VisualizationHeader>
          )}
          {replacementContent ? (
            replacementContent
          ) : isDashboard && noResults ? (
            <NoResultsView isSmall={small} />
          ) : error ? (
            <ErrorView
              error={error}
              icon={errorIcon}
              isSmall={small}
              isDashboard={isDashboard}
            />
          ) : loading ? (
            <LoadingView expectedDuration={expectedDuration} isSlow={isSlow} />
          ) : (
            <div
              data-card-key={getCardKey(series[0].card?.id)}
              className="flex flex-column flex-full"
            >
              <CardVisualization
                {...this.props}
                // NOTE: CardVisualization class used to target ExplicitSize HOC
                className="CardVisualization flex-full flex-basis-none"
                isPlaceholder={isPlaceholder}
                series={series}
                settings={settings}
                card={series[0].card} // convenience for single-series visualizations
                data={series[0].data} // convenience for single-series visualizations
                hovered={hovered}
                clicked={clicked}
                headerIcon={hasHeader ? null : headerIcon}
                onHoverChange={this.handleHoverChange}
                onVisualizationClick={this.handleVisualizationClick}
                visualizationIsClickable={this.visualizationIsClickable}
                onRenderError={this.onRenderError}
                onRender={this.onRender}
                onActionDismissal={this.hideActions}
                gridSize={gridSize}
                onChangeCardAndRun={
                  this.props.onChangeCardAndRun
                    ? this.handleOnChangeCardAndRun
                    : null
                }
              />
            </div>
          )}
          <ChartTooltip series={series} hovered={hovered} settings={settings} />
          {this.props.onChangeCardAndRun && (
            <ConnectedChartClickActions
              clicked={clicked}
              clickActions={regularClickActions}
              onChangeCardAndRun={this.handleOnChangeCardAndRun}
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

Visualization.defaultProps = defaultProps;

export default _.compose(
  ExplicitSize({
    selector: ".CardVisualization",
    refreshMode: props => (props.isVisible ? "throttle" : "debounce"),
  }),
  connect(mapStateToProps),
  memoizeClass("_getQuestionForCardCached"),
)(Visualization);
