import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Urls from "metabase/lib/urls";

import cx from "classnames";

const COLORS = ["#4A90E2", "#84BB4C", "#F9CF48", "#ED6E6E", "#885AB1"];

export default class LegendHeader extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            width: 0
        };
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        let width = ReactDOM.findDOMNode(this).offsetWidth;
        if (width !== this.state.width) {
            this.setState({ width });
        }
    }

    render() {
        const { card, series, onAddSeries } = this.props;
        const showTitles = !series || series.length === 0 || this.state.width > 150;
        return (
            <div className="Card-title my1 flex flex-no-shrink flex-row">
                <LegendItem card={card} index={0} showTitles={showTitles} />
                { series && series.map((s, index) =>
                    <LegendItem key={index} card={s.card} index={index + 1} showTitles={showTitles} />
                )}
                { onAddSeries &&
                    <AddSeriesItem onAddSeries={onAddSeries} showTitles={showTitles} />
                }
            </div>
        );
    }
}

const LegendItem = ({ card, index, showTitles }) =>
    <Tooltip key={index} tooltip={card.name}>
        <a href={Urls.card(card.id)} className={cx("no-decoration h3 mb1 text-bold flex align-center", { mr1: showTitles })} style={{ overflowX: "hidden", flex: "0 1 auto" }}>
            <div className="flex-no-shrink inline-block circular" style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: COLORS[index % COLORS.length]}} />
            {showTitles && <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{card.name}</div> }
        </a>
    </Tooltip>

const AddSeriesItem = ({ onAddSeries, showTitles }) =>
    <a className="h3 ml1 mr2 mb1 cursor-pointer flex-no-shrink flex align-center text-brand-hover" style={{ pointerEvents: "all" }} onClick={onAddSeries}>
        <span className="flex-no-shrink circular bordered border-brand flex layout-centered" style={{ width: 20, height: 20, marginRight: 8 }}>
            <Icon className="text-brand" name="add" width={12} height={12} />
        </span>
        { showTitles && <span className="flex-no-shrink">Add data</span> }
    </a>

export default LegendHeader;
