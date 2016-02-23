import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import styles from "./LegendHeader.css";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Urls from "metabase/lib/urls";
import { getCardColors } from "metabase/visualizations/lib/utils";

import cx from "classnames";

export default class LegendHeader extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            width: 0
        };
    }

    static propTypes = {
         series: PropTypes.array.isRequired,
         onAddSeries: PropTypes.func,
         hovered: PropTypes.object
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
        const { series, hovered, onAddSeries, onRemoveSeries, extraActions, onHoverChange } = this.props;
        const showDots = series.length > 1;
        const isNarrow = this.state.width < 150;
        const showTitles = !showDots || !isNarrow;
        const hoveredSeriesIndex = hovered && hovered.seriesIndex;

        let colors = getCardColors(series[0].card);
        return (
            <div  className={cx(styles.LegendHeader, "Card-title m1 flex flex-no-shrink flex-row align-center")}>
                { series.map((s, index) => [
                    <LegendItem key={index} card={s.card} index={index} color={colors[index % colors.length]} showDots={showDots} showTitles={showTitles} muted={hoveredSeriesIndex != null && index !== hoveredSeriesIndex} onHoverChange={onHoverChange} />,
                    onRemoveSeries && index > 0 && <Icon className="text-grey-2 flex-no-shrink mr1 cursor-pointer" name="close" width={12} height={12} onClick={() => onRemoveSeries(s.card)} />
                ])}
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

class LegendItem extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {
            tooltipIsEnabled: false
        };
    }

    componentDidUpdate() {
        // Only show tooltip if title is hidden or ellipsified
        const element = ReactDOM.findDOMNode(this.refs.title);
        const tooltipIsEnabled = !element || element.offsetWidth < element.scrollWidth;
        if (this.state.tooltipIsEnabled !== tooltipIsEnabled) {
            this.setState({ tooltipIsEnabled });
        }
    }

    render() {
        const { card, index, color, showDots, showTitles, muted, onHoverChange } = this.props;
        return (
            <Tooltip
                key={index}
                tooltip={card.name}
                verticalAttachments={["bottom", "top"]}
                onMouseEnter={() => onHoverChange && onHoverChange(null, null, index) }
                onMouseLeave={() => onHoverChange && onHoverChange(null, null, null) }
                isEnabled={this.state.tooltipIsEnabled}
            >
                <a href={card.id && Urls.card(card.id)} className={cx(styles.LegendItem, "no-decoration h3 text-bold flex align-center", { mr1: showTitles, muted: muted })} style={{ overflowX: "hidden", flex: "0 1 auto" }}>
                    {showDots && <div className="flex-no-shrink inline-block circular" style={{width: 13, height: 13, margin: 4, marginRight: 8, backgroundColor: color}} />}
                    {showTitles && <div ref="title" style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{card.name}</div> }
                </a>
            </Tooltip>
        );
    }
}

const AddSeriesItem = ({ onAddSeries, showTitles }) =>
    <a className={cx(styles.AddSeriesItem, "h3 ml1 mr2 cursor-pointer flex align-center text-brand-hover")} onClick={onAddSeries}>
        <span className="flex-no-shrink circular bordered border-brand flex layout-centered" style={{ width: 20, height: 20, marginRight: 8 }}>
            <Icon className="text-brand" name="add" width={10} height={10} />
        </span>
        { showTitles && <span className="flex-no-shrink">Edit data</span> }
    </a>

export default LegendHeader;
