import React, { Component, PropTypes } from "react";

import TooltipPopover from "metabase/components/TooltipPopover.jsx"

import { formatNumber, formatValue } from "metabase/lib/formatting";

export default class ChartTooltip extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {
        series: PropTypes.array.isRequired,
        hovered: PropTypes.object,
        pinToMouse: PropTypes.bool
    };
    static defaultProps = {
        pinToMouse: false
    };

    render() {
        const { series, hovered, pinToMouse } = this.props;
        if (!hovered || !hovered.data || (pinToMouse ? !hovered.event : !hovered.element)) {
            return <span className="hidden" />;
        }
        let s = series[hovered.seriesIndex || 0];
        return (
            <TooltipPopover
                target={pinToMouse ? null : hovered.element}
                targetEvent={pinToMouse ? hovered.event : null}
                verticalAttachments={["bottom", "top"]}
            >
                <div className="py1 px2">
                    <div>{formatValue(hovered.data.key, s.data.cols[0], { jsx: true, majorWidth: 0 })}</div>
                    <div>{formatNumber(hovered.data.value)}</div>
                </div>
            </TooltipPopover>
        );
    }
}
