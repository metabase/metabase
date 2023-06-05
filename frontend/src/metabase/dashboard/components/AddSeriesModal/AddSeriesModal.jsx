import { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { getIn } from "icepick";
import { connect } from "react-redux";

import Visualization from "metabase/visualizations/components/Visualization";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { color } from "metabase/lib/colors";
import { loadMetadataForQueries } from "metabase/redux/metadata";

import { QuestionList } from "./QuestionList";

class AddSeriesModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      error: null,
      series: props.dashcard.series || [],
      isLoadingMetadata: false,
    };
  }

  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    dashcardData: PropTypes.object.isRequired,
    fetchCardData: PropTypes.func.isRequired,
    fetchDatabaseMetadata: PropTypes.func.isRequired,
    setDashCardAttributes: PropTypes.func.isRequired,
    loadMetadataForQueries: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  handleQuestionSelectedChange = async (card, selected) => {
    const { dashcard, dashcardData } = this.props;

    if (!selected) {
      this.setState({
        series: this.state.series.filter(c => c.id !== card.id),
      });

      MetabaseAnalytics.trackStructEvent("Dashboard", "Remove Series");
      return;
    }

    if (getIn(dashcardData, [dashcard.id, card.id]) === undefined) {
      this.setState({ state: "loading" });
      await this.props.fetchCardData(card, dashcard, {
        reload: false,
        clear: true,
      });
    }

    this.setState({
      state: null,
      series: this.state.series.concat(card),
    });

    MetabaseAnalytics.trackStructEvent(
      "Dashboard",
      "Add Series",
      card.display + ", success",
    );
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
    const { dashcard, dashcardData } = this.props;

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
              data-metabase-event="Dashboard;Edit Series Modal;cancel"
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
            enabledCards={this.state.series}
            onSelect={this.handleQuestionSelectedChange}
            dashcard={this.props.dashcard}
          />
        </div>
      </div>
    );
  }
}

export default connect(null, { loadMetadataForQueries })(AddSeriesModal);
