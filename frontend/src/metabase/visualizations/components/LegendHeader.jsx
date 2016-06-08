import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./Legend.css";

import Icon from "metabase/components/Icon.jsx";
import LegendItem from "./LegendItem.jsx";

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
        hovered: PropTypes.object,
        onHoverChange: PropTypes.func,
        onRemoveSeries: PropTypes.func,
        actionButtons: PropTypes.node
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
        const { series, hovered, onRemoveSeries, actionButtons, onHoverChange } = this.props;
        const showDots = series.length > 1;
        const isNarrow = this.state.width < 150;
        const showTitles = !showDots || !isNarrow;

        let colors = getCardColors(series[0].card);
        return (
            <div  className={cx(styles.LegendHeader, "Card-title mx1 flex flex-no-shrink flex-row align-center")}>
                { series.map((s, index) => [
                    <LegendItem
                        key={index}
                        title={s.card.name}
                        href={s.card.id && Urls.card(s.card.id)}
                        color={colors[index % colors.length]}
                        showDot={showDots}
                        showTitle={showTitles}
                        isMuted={hovered && hovered.index != null && index !== hovered.index}
                        onMouseEnter={() => onHoverChange && onHoverChange({ index })}
                        onMouseLeave={() => onHoverChange && onHoverChange(null) }
                    />,
                    onRemoveSeries && index > 0 &&
                        <Icon
                            name="close"
                            className="text-grey-2 flex-no-shrink mr1 cursor-pointer"
                            width={12} height={12}
                            onClick={() => onRemoveSeries(s.card)}
                        />
                ])}
                { actionButtons &&
                    <span className="flex-no-shrink flex-align-right">
                        {actionButtons}
                    </span>
                }
            </div>
        );
    }
}
