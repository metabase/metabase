import React, { Component, PropTypes } from "react";

import Visualization from "metabase/visualizations/Visualization.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import CheckBox from "metabase/components/CheckBox.jsx";

import _ from "underscore";
import cx from "classnames";

export default class AddSeriesModal extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            searchValue: "",
            error: null,
            series: props.dashcard.series || [],
            seriesData: {},
            badCards: {}
        };

        _.bindAll(this, "onSearchChange", "onDone", "filterCards")
    }

    static propTypes = {};
    static defaultProps = {};

    async componentDidMount() {
        try {
            await this.props.fetchCards();
        } catch (error) {
            this.setState({ error });
        }
    }

    onSearchChange(e) {
        this.setState({ searchValue: e.target.value.toLowerCase() });
    }

    onCardChange(card, e) {
        let enabled = e.target.checked;
        let series = this.state.series.filter(c => c.id !== card.id);
        if (enabled) {
            series.push(card);
            if (this.state.seriesData[card.id] === undefined) {
                this.setState({ state: "loading" });
                setTimeout(() => {
                    let data = {
                        rows: [
                            ["Doohickey", Math.round(Math.random() * 5000)],
                            ["Gadget", Math.round(Math.random() * 5000)],
                            ["Gizmo", Math.round(Math.random() * 5000)],
                            ["Widget", Math.round(Math.random() * 5000)]
                        ]
                    }
                    if (card.dataset_query.type === "query" || Math.random() > 0.75) {
                        this.setState({
                            state: null,
                            seriesData: { ...this.state.seriesData, [card.id]: data }
                        });
                    } else {
                        this.setState({
                            state: "incompatible",
                            series: this.state.series.filter(c => c.id !== card.id),
                            seriesData: { ...this.state.seriesData, [card.id]: false },
                            badCards: { ...this.state.badCards, [card.id]: true }
                        });
                        setTimeout(() => this.setState({ state: null }), 2000);
                    }
                }, 1000);
            }
        }
        this.setState({ series });
    }

    onDone() {
        // this.props.onDone(this.state.series);
    }

    filterCards(cards) {
        let { card } = this.props.dashcard;
        let { searchValue } = this.state;
        return cards.filter(c => {
            if (c.id === card.id) {
                return false;
            } else if (searchValue && c.name.toLowerCase().indexOf(searchValue) < 0) {
                return false;
            } else {
                return true;
            }
        });
    }

    render() {
        let { card, dataset } = this.props.dashcard;
        let data = (dataset && dataset.data);

        let cards = this.props.cards;
        let error = this.state.error;

        let filteredCards;
        if (!error && cards) {
            filteredCards = this.filterCards(cards);
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
            })
        }

        let badCards = this.state.badCards;

        let enabledCards = {};
        for (let c of this.state.series) {
            enabledCards[c.id] = true;
        }

        let series = this.state.series.map(c => ({
            card: c,
            data: this.state.seriesData[c.id]
        })).filter(s => !!s.data);

        return (
            <div className="absolute top left bottom right flex">
                <div className="flex flex-column flex-full">
                    <div className="flex-no-shrink h3 pl4 pt4 pb1 text-bold">Add data</div>
                    <div className="flex flex-full relative">
                        <Visualization
                            className="flex-full"
                            card={card}
                            data={data}
                            series={series}
                            isDashboard={true}
                            onAddSeries={this.props.onAddSeries}
                        />
                        { this.state.state &&
                            <div className="absolute top left bottom right flex layout-centered" style={{ backgroundColor: "rgba(255,255,255,0.80)" }}>
                                { this.state.state === "loading" ?
                                    <div className="h3 rounded bordered p3 bg-white shadowed">Applying Question</div>
                                : this.state.state === "incompatible" ?
                                    <div className="h3 rounded bordered p3 bg-error border-error text-white">That question isn't compatible</div>
                                : null }
                            </div>
                        }
                    </div>
                    <div className="flex-no-shrink pl4 pb4 pt1">
                        <button className="Button Button--primary" onClick={this.onDone}>Done</button>
                        <button className="Button Button--borderless" onClick={this.props.onClose}>Cancel</button>
                    </div>
                </div>
                <div className="border-left flex flex-column" style={{width: 370, backgroundColor: "#F8FAFA", borderColor: "#DBE1DF" }}>
                    <div className="flex-no-shrink border-bottom flex flex-row align-center" style={{ borderColor: "#DBE1DF" }}>
                        <Icon className="ml2" name="search" width={16} height={16} />
                        <input className="h4 input full pl1" style={{ border: "none", backgroundColor: "transparent" }} type="search" placeholder="Search for a question" onChange={this.onSearchChange}/>
                    </div>
                    <LoadingAndErrorWrapper className="flex flex-full" loading={!filteredCards} error={error} noBackground>
                    { () =>
                        <ul className="flex-full scroll-y">
                        {filteredCards.map(card =>
                            <li key={card.id} className={cx("my1 px2 py1 flex align-center", { disabled: badCards[card.id] })}>
                                <span className="px1 flex-no-shrink">
                                    <CheckBox checked={enabledCards[card.id]} onChange={this.onCardChange.bind(this, card)}/>
                                </span>
                                <span className="px1">
                                    {card.name}
                                </span>
                                { card.dataset_query.type !== "query" &&
                                    <Tooltip className="px1 flex-align-right" tooltipElement="We're not sure if this question is compatible">
                                        <Icon className="text-grey-2 text-grey-4-hover cursor-pointer" name="warning" width={20} height={20} />
                                    </Tooltip>
                                }
                            </li>
                        )}
                        </ul>
                    }
                    </LoadingAndErrorWrapper>
                </div>
            </div>
        );
    }
}
