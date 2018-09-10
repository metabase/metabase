import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";

import Visualization from "metabase/visualizations/components/Visualization.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";
import MetabaseAnalytics from "metabase/lib/analytics";
import Query from "metabase/lib/query";
import colors from "metabase/lib/colors";

import { getVisualizationRaw } from "metabase/visualizations";

import _ from "underscore";
import cx from "classnames";
import { getIn } from "icepick";

function getQueryColumns(card, databases) {
  let dbId = card.dataset_query.database;
  if (card.dataset_query.type !== "query") {
    return null;
  }
  let query = card.dataset_query.query;
  let table =
    databases &&
    databases[dbId] &&
    databases[dbId].tables_lookup[query.source_table];
  if (!table) {
    return null;
  }
  return Query.getQueryColumns(table, query);
}

export default class AddSeriesModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      searchValue: "",
      error: null,
      series: props.dashcard.series || [],
      badCards: {},
    };

    _.bindAll(
      this,
      "onSearchChange",
      "onSearchFocus",
      "onDone",
      "filteredCards",
      "onRemoveSeries",
    );
  }

  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    cards: PropTypes.array,
    dashcardData: PropTypes.object.isRequired,
    fetchCards: PropTypes.func.isRequired,
    fetchCardData: PropTypes.func.isRequired,
    fetchDatabaseMetadata: PropTypes.func.isRequired,
    setDashCardAttributes: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  async componentDidMount() {
    try {
      await this.props.fetchCards();
      await Promise.all(
        _.uniq(this.props.cards.map(c => c.database_id)).map(db_id =>
          this.props.fetchDatabaseMetadata(db_id),
        ),
      );
    } catch (error) {
      console.error(error);
      this.setState({ error });
    }
  }

  onSearchFocus() {
    MetabaseAnalytics.trackEvent("Dashboard", "Edit Series Modal", "search");
  }

  onSearchChange(e) {
    this.setState({ searchValue: e.target.value.toLowerCase() });
  }

  async onCardChange(card, e) {
    const { dashcard, dashcardData } = this.props;
    let { CardVisualization } = getVisualizationRaw([{ card: dashcard.card }]);
    try {
      if (e.target.checked) {
        if (getIn(dashcardData, [dashcard.id, card.id]) === undefined) {
          this.setState({ state: "loading" });
          await this.props.fetchCardData(card, dashcard, {
            reload: false,
            clear: true,
          });
        }
        let sourceDataset = getIn(this.props.dashcardData, [
          dashcard.id,
          dashcard.card.id,
        ]);
        let seriesDataset = getIn(this.props.dashcardData, [
          dashcard.id,
          card.id,
        ]);
        if (
          CardVisualization.seriesAreCompatible(
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
            badCards: { ...this.state.badCards, [card.id]: true },
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
      console.error("onCardChange", e);
      this.setState({
        state: "incompatible",
        badCards: { ...this.state.badCards, [card.id]: true },
      });
      setTimeout(() => this.setState({ state: null }), 2000);
    }
  }

  onRemoveSeries(card) {
    this.setState({ series: this.state.series.filter(c => c.id !== card.id) });
    MetabaseAnalytics.trackEvent("Dashboard", "Remove Series");
  }

  onDone() {
    this.props.setDashCardAttributes({
      id: this.props.dashcard.id,
      attributes: { series: this.state.series },
    });
    this.props.onClose();
    MetabaseAnalytics.trackEvent("Dashboard", "Edit Series Modal", "done");
  }

  filteredCards() {
    const { cards, dashcard, databases, dashcardData } = this.props;
    const { searchValue } = this.state;

    const initialSeries = {
      card: dashcard.card,
      data: getIn(dashcardData, [dashcard.id, dashcard.card.id, "data"]),
    };

    let { CardVisualization } = getVisualizationRaw([{ card: dashcard.card }]);

    return cards.filter(card => {
      try {
        // filter out the card itself
        if (card.id === dashcard.card.id) {
          return false;
        }
        if (card.dataset_query.type === "query") {
          if (
            !CardVisualization.seriesAreCompatible(initialSeries, {
              card: card,
              data: { cols: getQueryColumns(card, databases), rows: [] },
            })
          ) {
            return false;
          }
        }
        // search
        if (searchValue && card.name.toLowerCase().indexOf(searchValue) < 0) {
          return false;
        }
        return true;
      } catch (e) {
        console.warn(e);
        return false;
      }
    });
  }

  render() {
    const { dashcard, dashcardData, cards } = this.props;

    let error = this.state.error;

    let filteredCards;
    if (!error && cards) {
      filteredCards = this.filteredCards();
      if (filteredCards.length === 0) {
        error = new Error("Whoops, no compatible questions match your search.");
      }
      // SQL cards at the bottom
      filteredCards.sort((a, b) => {
        if (a.dataset_query.type !== "query") {
          return 1;
        } else if (b.dataset_query.type !== "query") {
          return -1;
        } else {
          return 0;
        }
      });
    }

    let badCards = this.state.badCards;

    let enabledCards = {};
    for (let c of this.state.series) {
      enabledCards[c.id] = true;
    }

    let series = [dashcard.card]
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
              onRemoveSeries={this.onRemoveSeries}
            />
            {this.state.state && (
              <div
                className="spred flex layout-centered"
                style={{ backgroundColor: colors["bg-white"] }}
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
            <button className="Button Button--primary" onClick={this.onDone}>
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
            backgroundColor: colors["bg-light"],
            borderColor: colors["border"],
          }}
        >
          <div
            className="flex-no-shrink border-bottom flex flex-row align-center"
            style={{ borderColor: colors["border"] }}
          >
            <Icon className="ml2" name="search" size={16} />
            <input
              className="h4 input full pl1"
              style={{ border: "none", backgroundColor: "transparent" }}
              type="search"
              placeholder={t`Search for a question`}
              onFocus={this.onSearchFocus}
              onChange={this.onSearchChange}
            />
          </div>
          <LoadingAndErrorWrapper
            className="flex flex-full"
            loading={!filteredCards}
            error={error}
            noBackground
          >
            {() => (
              <ul className="flex-full scroll-y scroll-show pr1">
                {filteredCards.map(card => (
                  <li
                    key={card.id}
                    className={cx("my1 pl2 py1 flex align-center", {
                      disabled: badCards[card.id],
                    })}
                  >
                    <span className="px1 flex-no-shrink">
                      <CheckBox
                        checked={enabledCards[card.id]}
                        onChange={this.onCardChange.bind(this, card)}
                      />
                    </span>
                    <span className="px1">{card.name}</span>
                    {card.dataset_query.type !== "query" && (
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
