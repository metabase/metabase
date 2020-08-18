import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";
import { getIn } from "icepick";
import { connect } from "react-redux";
import { createSelector } from "reselect";

import Visualization from "metabase/visualizations/components/Visualization";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import CheckBox from "metabase/components/CheckBox";

import MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";

import Questions from "metabase/entities/questions";
import { getMetadata } from "metabase/selectors/metadata";
import { loadMetadataForQueries } from "metabase/redux/metadata";

import Question from "metabase-lib/lib/Question";

import { getVisualizationRaw } from "metabase/visualizations";

const getQuestions = createSelector(
  [getMetadata, (state, ownProps) => ownProps.questions],
  (metadata, questions) =>
    questions && questions.map(card => new Question(card, metadata)),
);

// TODO: rework this so we don't have to load all cards up front
@Questions.loadList({ query: { f: "all" } })
@connect(
  (state, ownProps) => ({
    questions: getQuestions(state, ownProps),
  }),
  { loadMetadataForQueries },
)
export default class AddSeriesModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      searchValue: "",
      error: null,
      series: props.dashcard.series || [],
      badQuestions: {},
    };
  }

  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    questions: PropTypes.array,
    dashcardData: PropTypes.object.isRequired,
    fetchCardData: PropTypes.func.isRequired,
    fetchDatabaseMetadata: PropTypes.func.isRequired,
    setDashCardAttributes: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  async componentWillMount() {
    const { questions, loadMetadataForQueries } = this.props;
    try {
      await loadMetadataForQueries(questions.map(question => question.query()));
    } catch (error) {
      console.error("AddSeriesModal loadMetadataForQueries", error);
      this.setState({ error });
    }
  }

  handleSearchFocus = () => {
    MetabaseAnalytics.trackEvent("Dashboard", "Edit Series Modal", "search");
  };

  handleSearchChange = e => {
    this.setState({ searchValue: e.target.value.toLowerCase() });
  };

  async handleQuestionSelectedChange(question, selected) {
    const { dashcard, dashcardData } = this.props;
    const { visualization } = getVisualizationRaw([{ card: dashcard.card }]);
    const card = question.card();
    try {
      if (selected) {
        if (getIn(dashcardData, [dashcard.id, card.id]) === undefined) {
          this.setState({ state: "loading" });
          await this.props.fetchCardData(card, dashcard, {
            reload: false,
            clear: true,
          });
        }
        const sourceDataset = getIn(this.props.dashcardData, [
          dashcard.id,
          dashcard.card.id,
        ]);
        const seriesDataset = getIn(this.props.dashcardData, [
          dashcard.id,
          card.id,
        ]);
        if (
          visualization.seriesAreCompatible(
            { card: dashcard.card, data: sourceDataset.data },
            { card: card, data: seriesDataset.data },
          )
        ) {
          this.setState({
            state: null,
            series: this.state.series.concat(card),
          });

          MetabaseAnalytics.trackEvent(
            "Dashboard",
            "Add Series",
            card.display + ", success",
          );
        } else {
          this.setState({
            state: "incompatible",
            badQuestions: { ...this.state.badQuestions, [card.id]: true },
          });
          setTimeout(() => this.setState({ state: null }), 2000);

          MetabaseAnalytics.trackEvent(
            "Dashboard",
            "Add Series",
            card.dataset_query.type + ", " + card.display + ", fail",
          );
        }
      } else {
        this.setState({
          series: this.state.series.filter(c => c.id !== card.id),
        });

        MetabaseAnalytics.trackEvent("Dashboard", "Remove Series");
      }
    } catch (e) {
      console.error("AddSeriesModal handleQuestionChange", e);
      this.setState({
        state: "incompatible",
        badQuestions: { ...this.state.badQuestions, [card.id]: true },
      });
      setTimeout(() => this.setState({ state: null }), 2000);
    }
  }

  handleRemoveSeries(card) {
    this.setState({ series: this.state.series.filter(c => c.id !== card.id) });
    MetabaseAnalytics.trackEvent("Dashboard", "Remove Series");
  }

  handleDone = () => {
    this.props.setDashCardAttributes({
      id: this.props.dashcard.id,
      attributes: { series: this.state.series },
    });
    this.props.onClose();
    MetabaseAnalytics.trackEvent("Dashboard", "Edit Series Modal", "done");
  };

  filteredQuestions = () => {
    const { questions, dashcard, dashcardData } = this.props;
    const { searchValue } = this.state;

    const initialSeries = {
      card: dashcard.card,
      data: getIn(dashcardData, [dashcard.id, dashcard.card.id, "data"]),
    };

    const { visualization } = getVisualizationRaw([{ card: dashcard.card }]);

    return questions.filter(question => {
      try {
        // filter out the card itself
        if (question.id() === dashcard.card.id) {
          return false;
        }
        if (question.isStructured()) {
          if (
            !visualization.seriesAreCompatible(initialSeries, {
              card: question.card(),
              data: { cols: question.query().columns(), rows: [] },
            })
          ) {
            return false;
          }
        }
        // search
        if (
          searchValue &&
          question
            .displayName()
            .toLowerCase()
            .indexOf(searchValue) < 0
        ) {
          return false;
        }
        return true;
      } catch (e) {
        console.warn(e);
        return false;
      }
    });
  };

  render() {
    const { dashcard, dashcardData, questions } = this.props;
    const { badQuestions } = this.state;

    let error = this.state.error;

    let filteredQuestions;
    if (!error && questions) {
      filteredQuestions = this.filteredQuestions();
      if (filteredQuestions.length === 0) {
        error = new Error("Whoops, no compatible questions match your search.");
      }
      // SQL cards at the bottom
      filteredQuestions.sort((a, b) => {
        if (!a.isNative()) {
          return 1;
        } else if (!b.isNative()) {
          return -1;
        } else {
          return 0;
        }
      });
    }

    const enabledQuestions = {};
    for (const card of this.state.series) {
      enabledQuestions[card.id] = true;
    }

    const series = [dashcard.card]
      .concat(this.state.series)
      .map(card => ({
        card: card,
        data: getIn(dashcardData, [dashcard.id, card.id, "data"]),
      }))
      .filter(s => !!s.data);

    return (
      <div className="spread flex">
        <div className="flex flex-column flex-full">
          <div className="flex-no-shrink h3 pl4 pt4 pb2 text-bold">
            Edit data
          </div>
          <div className="flex-full ml2 mr1 relative">
            <Visualization
              className="spread"
              rawSeries={series}
              showTitle
              isDashboard
              isMultiseries
              onRemoveSeries={this.handleRemoveSeries}
            />
            {this.state.state && (
              <div
                className="spred flex layout-centered"
                style={{ backgroundColor: color("bg-white") }}
              >
                {this.state.state === "loading" ? (
                  <div className="h3 rounded bordered p3 bg-white shadowed">
                    {t`Applying Question`}
                  </div>
                ) : this.state.state === "incompatible" ? (
                  <div className="h3 rounded bordered p3 bg-error border-error text-white">
                    {t`That question isn't compatible`}
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <div className="flex-no-shrink pl4 pb4 pt1">
            <button
              className="Button Button--primary"
              onClick={this.handleDone}
            >
              {t`Done`}
            </button>
            <button
              data-metabase-event={"Dashboard;Edit Series Modal;cancel"}
              className="Button ml2"
              onClick={this.props.onClose}
            >
              {t`Cancel`}
            </button>
          </div>
        </div>
        <div
          className="border-left flex flex-column scroll-y"
          style={{
            width: 370,
            backgroundColor: color("bg-light"),
            borderColor: color("border"),
          }}
        >
          <div
            className="flex-no-shrink border-bottom flex flex-row align-center"
            style={{ borderColor: color("border") }}
          >
            <Icon className="ml2" name="search" size={16} />
            <input
              className="h4 input full pl1"
              style={{ border: "none", backgroundColor: "transparent" }}
              type="search"
              placeholder={t`Search for a question`}
              onFocus={this.handleSearchFocus}
              onChange={this.handleSearchChange}
            />
          </div>
          <LoadingAndErrorWrapper
            className="flex flex-full"
            loading={!filteredQuestions}
            error={error}
            noBackground
          >
            {() => (
              <ul className="pr1">
                {filteredQuestions.map(question => (
                  <li
                    key={question.id()}
                    className={cx("my1 pl2 py1 flex align-center", {
                      disabled: badQuestions[question.id()],
                    })}
                  >
                    <span className="px1 flex-no-shrink">
                      <CheckBox
                        checked={enabledQuestions[question.id()]}
                        onChange={e =>
                          this.handleQuestionSelectedChange(
                            question,
                            e.target.checked,
                          )
                        }
                      />
                    </span>
                    <span className="px1">{question.displayName()}</span>
                    {!question.isStructured() && (
                      <Tooltip
                        tooltip={t`We're not sure if this question is compatible`}
                      >
                        <Icon
                          className="px1 flex-align-right text-light text-medium-hover cursor-pointer flex-no-shrink"
                          name="warning"
                          size={20}
                        />
                      </Tooltip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </LoadingAndErrorWrapper>
        </div>
      </div>
    );
  }
}
