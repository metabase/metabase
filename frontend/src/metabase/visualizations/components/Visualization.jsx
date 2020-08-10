/* @flow weak */

import React from "react";

import ExplicitSize from "metabase/components/ExplicitSize";
import LegendHeader from "metabase/visualizations/components/LegendHeader";
import ChartTooltip from "metabase/visualizations/components/ChartTooltip";
import ChartClickActions from "metabase/visualizations/components/ChartClickActions";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { t, jt } from "ttag";
import { duration, formatNumber } from "metabase/lib/formatting";
import MetabaseAnalytics from "metabase/lib/analytics";

import {
  getVisualizationTransformed,
  extractRemappings,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import { performDefaultAction } from "metabase/visualizations/lib/action";

import Utils from "metabase/lib/utils";
import { datasetContainsNoResults } from "metabase/lib/dataset";

import {
  MinRowsError,
  ChartSettingsError,
} from "metabase/visualizations/lib/errors";

import NoResults from "assets/img/no_results.svg";

import { assoc, setIn } from "icepick";
import _ from "underscore";
import cx from "classnames";

export const ERROR_MESSAGE_GENERIC = t`There was a problem displaying this chart.`;
export const ERROR_MESSAGE_PERMISSION = t`Sorry, you don't have permission to see this card.`;

import Question from "metabase-lib/lib/Question";
import Mode from "metabase-lib/lib/Mode";
import type {
  Card as CardObject,
  VisualizationSettings,
} from "metabase-types/types/Card";
import type {
  HoverObject,
  ClickObject,
  Series,
  RawSeries,
  OnChangeCardAndRun,
} from "metabase-types/types/Visualization";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import { memoize } from "metabase-lib/lib/utils";

type Props = {
  rawSeries: RawSeries,

  className: string,
  style: { [key: string]: any },

  showTitle: boolean,
  isDashboard: boolean,
  isEditing: boolean,
  isSettings: boolean,

  actionButtons: React.Element<any>,

  // errors
  error: string,
  errorIcon: string,

  // slow card warnings
  isSlow: boolean,
  expectedDuration: number,

  // injected by ExplicitSize
  width: number,
  height: number,

  // settings overrides from settings panel
  settings: VisualizationSettings,

  // for click actions
  metadata: Metadata,
  dispatch: Function,
  onChangeCardAndRun: OnChangeCardAndRun,
  onChangeLocation: (url: string) => void,

  mode?: Mode,

  // used for showing content in place of visualization, e.x. dashcard filter mapping
  replacementContent: React.Element<any>,

  // misc
  onUpdateWarnings: (string[]) => void,
  onOpenChartSettings: ({ section?: ?string, widget?: ?any }) => void,
  onUpdateVisualizationSettings: (settings: { [key: string]: any }) => void,

  // number of grid cells wide and tall
  gridSize?: { width: number, height: number },
  // if gridSize isn't specified, compute using this gridSize (4x width, 3x height)
  gridUnit?: number,

  classNameWidgets?: string,
};

type State = {
  series: ?Series,
  visualization: ?(React.Component<void, VisualizationSettings, void> & {
    checkRenderable: (any, any) => void,
    noHeader: boolean,
  }),
  computedSettings: VisualizationSettings,

  hovered: ?HoverObject,
  clicked: ?ClickObject,

  error: ?Error,
  warnings: string[],
  yAxisSplit: ?(number[][]),
};

// NOTE: pass `CardVisualization` so that we don't include header when providing size to child element
@ExplicitSize({ selector: ".CardVisualization" })
export default class Visualization extends React.PureComponent {
  state: State;
  props: Props;

  _resetHoverTimer: ?number;

  constructor(props: Props) {
    super(props);

    this.state = {
      hovered: null,
      clicked: null,
      error: null,
      warnings: [],
      yAxisSplit: null,
      series: null,
      visualization: null,
      computedSettings: {},
    };
  }

  static defaultProps = {
    showTitle: false,
    isDashboard: false,
    isEditing: false,
    isSettings: false,
    onUpdateVisualizationSettings: () => {},
    // prefer passing in a function that doesn't cause the application to reload
    onChangeLocation: location => {
      window.location = location;
    },
  };

  componentWillMount() {
    this.transform(this.props);
  }

  componentWillReceiveProps(newProps) {
    if (
      !isSameSeries(newProps.rawSeries, this.props.rawSeries) ||
      !Utils.equals(newProps.settings, this.props.settings)
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

  // NOTE: this is a PureComponent
  // shouldComponentUpdate(nextProps, nextState) {
  // }

  // $FlowFixMe
  getWarnings(props = this.props, state = this.state) {
    let warnings = state.warnings || [];
    // don't warn about truncated data for table since we show a warning in the row count
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
    const computedSettings = series
      ? getComputedSettingsForSeries(series)
      : null;
    this.setState({
      hovered: null,
      clicked: null,
      error: null,
      warnings: [],
      yAxisSplit: null,
      series: series,
      visualization: visualization,
      computedSettings: computedSettings,
    });
  }

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
      // When reseting the hover wait in case we're simply transitioning from one
      // element to another. This allows visualizations to use mouseleave events etc.
      this._resetHoverTimer = setTimeout(() => {
        this.setState({ hovered: null });
        this._resetHoverTimer = null;
      }, 0);
    }
  };

  @memoize
  _getQuestionForCardCached(metadata, card) {
    return metadata && card && new Question(card, metadata);
  }

  getClickActions(clicked: ?ClickObject) {
    if (!clicked) {
      return [];
    }
    const { rawSeries, metadata } = this.props;
    // TODO: push this logic into Question?
    const seriesIndex = clicked.seriesIndex || 0;
    const card = rawSeries[seriesIndex].card;
    const question = this._getQuestionForCardCached(metadata, card);
    const mode = this.props.mode
      ? question && new Mode(question, this.props.mode)
      : question && question.mode();
    return mode ? mode.actionsForClick(clicked, {}) : [];
  }

  visualizationIsClickable = (clicked: ClickObject) => {
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

  handleVisualizationClick = (clicked: ClickObject) => {
    if (clicked) {
      MetabaseAnalytics.trackEvent(
        "Actions",
        "Clicked",
        `${clicked.column ? "column" : ""} ${clicked.value ? "value" : ""} ${
          clicked.dimensions ? "dimensions=" + clicked.dimensions.length : ""
        }`,
      );
    }

    if (
      performDefaultAction(this.getClickActions(clicked), {
        dispatch: this.props.dispatch,
        onChangeCardAndRun: this.handleOnChangeCardAndRun,
      })
    ) {
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
    seriesIndex,
  }: {
    nextCard: CardObject,
    seriesIndex: number,
  }) => {
    const { series, clicked } = this.state;

    const index = seriesIndex || (clicked && clicked.seriesIndex) || 0;
    const previousCard: ?CardObject =
      series && series[index] && series[index].card;

    this.props.onChangeCardAndRun({ nextCard, previousCard });
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
      showTitle,
      isDashboard,
      width,
      height,
      errorIcon,
      isSlow,
      expectedDuration,
      replacementContent,
      onOpenChartSettings,
    } = this.props;
    const { visualization } = this.state;
    const small = width < 330;

    // these may be overridden below
    let { series, hovered, clicked } = this.state;
    let { style } = this.props;

    const clickActions = this.getClickActions(clicked);
    // disable hover when click action is active
    if (clickActions.length > 0) {
      hovered = null;
    }

    let error = this.props.error || this.state.error;
    const loading = !(
      series &&
      series.length > 0 &&
      _.every(
        series,
        s => s.data || _.isObject(s.card.visualization_settings.virtual_card),
      )
    );
    let noResults = false;
    let isPlaceholder = false;

    // don't try to load settings unless data is loaded
    let settings = this.props.settings || {};

    if (!loading && !error) {
      settings = this.props.settings || this.state.computedSettings;
      if (!visualization) {
        error = t`Could not find visualization`;
      } else {
        try {
          if (visualization.checkRenderable) {
            visualization.checkRenderable(series, settings);
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
              <div>
                <div>{error}</div>
                <div className="mt2">
                  <button
                    className="Button Button--primary Button--medium"
                    onClick={() => this.props.onOpenChartSettings(e.initial)}
                  >
                    {e.buttonText}
                  </button>
                </div>
              </div>
            );
          } else if (e instanceof MinRowsError) {
            noResults = true;
          }
        }
      }
    }

    if (!error) {
      noResults = _.every(
        // $FlowFixMe
        series,
        s => s && s.data && datasetContainsNoResults(s.data),
      );
    }

    const extra = (
      <span className="flex align-center">
        {isSlow && !loading && (
          <LoadingSpinner
            size={18}
            className={cx(
              "Visualization-slow-spinner",
              isSlow === "usually-slow" ? "text-gold" : "text-slate",
            )}
          />
        )}
        {actionButtons}
      </span>
    );

    let { gridSize, gridUnit, classNameWidgets } = this.props;
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

    return (
      <div className={cx(className, "flex flex-column")} style={style}>
        {(showTitle &&
          (settings["card.title"] || extra) &&
          (loading ||
            error ||
            noResults ||
            !(visualization && visualization.noHeader))) ||
        replacementContent ? (
          <div className="p1 flex-no-shrink">
            <LegendHeader
              classNameWidgets={classNameWidgets}
              series={
                settings["card.title"]
                  ? // if we have a card title set, use it
                    // $FlowFixMe
                    setIn(series, [0, "card", "name"], settings["card.title"])
                  : // otherwise use the original series
                    series
              }
              actionButtons={extra}
              description={settings["card.description"]}
              settings={settings}
              onChangeCardAndRun={
                this.props.onChangeCardAndRun
                  ? this.handleOnChangeCardAndRun
                  : null
              }
            />
          </div>
        ) : null}
        {replacementContent ? (
          replacementContent
        ) : // on dashboards we should show the "No results!" warning if there are no rows or there's a MinRowsError and actualRows === 0
        isDashboard && noResults ? (
          <div
            className={
              "flex-full px1 pb1 text-centered flex flex-column layout-centered " +
              (isDashboard ? "text-slate-light" : "text-slate")
            }
          >
            <Tooltip tooltip={t`No results!`} isEnabled={small}>
              <img src={NoResults} />
            </Tooltip>
            {!small && <span className="h4 text-bold">No results!</span>}
          </div>
        ) : error ? (
          <div
            className={
              "flex-full px1 pb1 text-centered flex flex-column layout-centered " +
              (isDashboard ? "text-slate-light" : "text-slate")
            }
          >
            <Tooltip tooltip={error} isEnabled={small}>
              <Icon className="mb2" name={errorIcon || "warning"} size={50} />
            </Tooltip>
            {!small && <span className="h4 text-bold">{error}</span>}
          </div>
        ) : loading ? (
          <div className="flex-full p1 text-centered text-brand flex flex-column layout-centered">
            {isSlow ? (
              <div className="text-slate">
                <div className="h4 text-bold mb1">{t`Still Waiting...`}</div>
                {isSlow === "usually-slow" ? (
                  <div>
                    {jt`This usually takes an average of ${(
                      <span style={{ whiteSpace: "nowrap" }}>
                        {duration(expectedDuration)}
                      </span>
                    )}.`}
                    <br />
                    {t`(This is a bit long for a dashboard)`}
                  </div>
                ) : (
                  <div>
                    {t`This is usually pretty fast but seems to be taking a while right now.`}
                  </div>
                )}
              </div>
            ) : (
              <LoadingSpinner className="text-slate" />
            )}
          </div>
        ) : (
          // $FlowFixMe
          <CardVisualization
            {...this.props}
            // NOTE: CardVisualization class used to target ExplicitSize HOC
            className="CardVisualization flex-full flex-basis-none"
            series={series}
            settings={settings}
            // $FlowFixMe
            card={series[0].card} // convenience for single-series visualizations
            // $FlowFixMe
            data={series[0].data} // convenience for single-series visualizations
            hovered={hovered}
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
        )}
        <ChartTooltip series={series} hovered={hovered} settings={settings} />
        {this.props.onChangeCardAndRun && (
          <ChartClickActions
            clicked={clicked}
            clickActions={clickActions}
            onChangeCardAndRun={this.handleOnChangeCardAndRun}
            onClose={this.hideActions}
          />
        )}
      </div>
    );
  }
}
