import React, { Component, PropTypes } from "react";

import TooltipPopover from "metabase/components/TooltipPopover.jsx"

import { formatValue } from "metabase/lib/formatting";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

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
        let s = series[hovered.seriesIndex] || series[0];
        return (
            <TooltipPopover
                target={pinToMouse ? null : hovered.element}
                targetEvent={pinToMouse ? hovered.event : null}
                verticalAttachments={["bottom", "top"]}
            >
                <table className="py1 px2">
                    <tbody>
                        { [["key", 0], ["value", 1]].map(([propName, colIndex]) =>
                            <tr key={propName} className="">
                                <th className="text-light text-right">{getFriendlyName(s.data.cols[colIndex])}:</th>
                                <th className="pl1 text-bold text-left">{formatValue(hovered.data[propName], s.data.cols[colIndex], { jsx: true, majorWidth: 0 })}</th>
                            </tr>
                        )}
                    </tbody>
                </table>
            </TooltipPopover>
        );
    }
}
