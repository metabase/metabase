import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Urls from "metabase/lib/urls";
import { getCardColors } from "metabase/card/lib/utils";

import cx from "classnames";

const COLORS = ["#4A90E2", "#84BB4C", "#F9CF48", "#ED6E6E", "#885AB1"];

export default class LegendHeader extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            width: 0
        };
    }

    static propTypes = {
         series: PropTypes.array.isRequired,
         onAddSeries: PropTypes.func
    };

    static defaultProps = {
        series: []
    };

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
        const { series, onAddSeries, extraActions, onSeriesHoverChange } = this.props;
        const showDots = series.length > 1;
        const isNarrow = this.state.width < 150;
        const showTitles = !showDots || !isNarrow;

        let colors = getCardColors(series[0].card);
        return (
            <div className="Card-title m1 flex flex-no-shrink flex-row align-center">
                { series.map((s, index) =>
                    <LegendItem key={index} card={s.card} index={index} color={colors[index % colors.length]} showDots={showDots} showTitles={showTitles} onSeriesHoverChange={onSeriesHoverChange} />
                )}
                { onAddSeries &&
                    <span className="DashCard-actions flex-no-shrink">
                        <AddSeriesItem onAddSeries={onAddSeries} showTitles={!isNarrow} />
                    </span>
                }
                { extraActions &&
                    <span className="DashCard-actions flex-no-shrink flex-align-right">
                        {extraActions}
                    </span>
                }
            </div>
        );
    }
}

const LegendItem = ({ card, index, color, showDots, showTitles, onSeriesHoverChange }) =>
    <Tooltip
        key={index}
        tooltip={card.name}
        verticalAttachments={["bottom", "top"]}
        onMouseEnter={() => onSeriesHoverChange && onSeriesHoverChange(index) }
        onMouseLeave={() => onSeriesHoverChange && onSeriesHoverChange(null) }
    >
        <a href={Urls.card(card.id)} className={cx("no-decoration h3 text-bold flex align-center", { mr1: showTitles })} style={{ overflowX: "hidden", flex: "0 1 auto" }}>
            {showDots && <div className="flex-no-shrink inline-block circular" style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: color}} />}
            {showTitles && <div style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{card.name}</div> }
        </a>
    </Tooltip>

const AddSeriesItem = ({ onAddSeries, showTitles }) =>
    <a className="h3 ml1 mr2 cursor-pointer flex align-center text-brand-hover" onClick={onAddSeries}>
        <span className="flex-no-shrink circular bordered border-brand flex layout-centered" style={{ width: 20, height: 20, marginRight: 8 }}>
            <Icon className="text-brand" name="add" width={10} height={10} />
        </span>
        { showTitles && <span className="flex-no-shrink">Add data</span> }
    </a>

export default LegendHeader;
