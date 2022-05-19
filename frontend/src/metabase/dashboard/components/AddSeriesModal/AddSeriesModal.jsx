/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { getIn } from "icepick";
import { connect } from "react-redux";
import { createSelector } from "reselect";
import _ from "underscore";

import Visualization from "metabase/visualizations/components/Visualization";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";

import Questions from "metabase/entities/questions";
import { getMetadataWithHiddenTables } from "metabase/selectors/metadata";
import { loadMetadataForQueries } from "metabase/redux/metadata";

import Question from "metabase-lib/lib/Question";

import { getVisualizationRaw } from "metabase/visualizations";

import { QuestionList } from "./QuestionList";

const getQuestions = createSelector(
  [getMetadataWithHiddenTables, (_state, props) => props.questions],
  (metadata, questions) =>
    questions && questions.map(card => new Question(card, metadata)),
);

// TODO: rework this so we don't have to load all cards up front

class AddSeriesModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      error: null,
      series: props.dashcard.series || [],
      badQuestions: {},
      isLoadingMetadata: false,
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

  handleQuestionSelectedChange = async (question, selected) => {
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

          MetabaseAnalytics.trackStructEvent(
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

          MetabaseAnalytics.trackStructEvent(
            "Dashboard",
            "Add Series",
            card.dataset_query.type + ", " + card.display + ", fail",
          );
        }
      } else {
        this.setState({
          series: this.state.series.filter(c => c.id !== card.id),
        });

        MetabaseAnalytics.trackStructEvent("Dashboard", "Remove Series");
      }
    } catch (e) {
      console.error("AddSeriesModal handleQuestionChange", e);
      this.setState({
        state: "incompatible",
        badQuestions: { ...this.state.badQuestions, [card.id]: true },
      });
      setTimeout(() => this.setState({ state: null }), 2000);
    }
  };

  handleRemoveSeries(card) {
    this.setState({ series: this.state.series.filter(c => c.id !== card.id) });
    MetabaseAnalytics.trackStructEvent("Dashboard", "Remove Series");
  }

  handleDone = () => {
    this.props.setDashCardAttributes({
      id: this.props.dashcard.id,
      attributes: { series: this.state.series },
    });
    this.props.onClose();
    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Edit Series Modal",
      "done",
    );
  };

  handleLoadMetadata = async queries => {
    this.setState({ isLoadingMetadata: true });
    await this.props.loadMetadataForQueries(queries);
    this.setState({ isLoadingMetadata: false });
  };

  render() {
    const { dashcard, dashcardData, questions } = this.props;
    const { badQuestions } = this.state;

    const { visualization } = getVisualizationRaw([{ card: dashcard.card }]);

    const error = this.state.error;

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
          className="border-left flex flex-column"
          style={{
            width: 370,
            backgroundColor: color("bg-light"),
            borderColor: color("border"),
          }}
        >
          <QuestionList
            questions={questions}
            badQuestions={badQuestions}
            enabledQuestions={enabledQuestions}
            error={error}
            onSelect={this.handleQuestionSelectedChange}
            dashcard={this.props.dashcard}
            dashcardData={this.props.dashcardData}
            loadMetadataForQueries={this.handleLoadMetadata}
            visualization={visualization}
            isLoadingMetadata={this.state.isLoadingMetadata}
          />
        </div>
      </div>
    );
  }
}

export default _.compose(
  Questions.loadList({ query: { f: "all" } }),
  connect(
    (state, ownProps) => ({
      questions: getQuestions(state, ownProps),
    }),
    { loadMetadataForQueries },
  ),
)(AddSeriesModal);
