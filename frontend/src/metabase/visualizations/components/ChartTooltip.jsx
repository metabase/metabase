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
        hovered: PropTypes.object
    };
    static defaultProps = {
    };

    render() {
        const { series, hovered } = this.props;
        if (!(hovered && hovered.data && ((hovered.element && document.contains(hovered.element)) || hovered.event))) {
            return <span className="hidden" />;
        }
        let s = series[hovered.index] || series[0];
        return (
            <TooltipPopover
                target={hovered.element}
                targetEvent={hovered.event}
                verticalAttachments={["bottom", "top"]}
            >
                <table className="py1 px2">
                    <tbody>
                        { Array.isArray(hovered.data)  ?
                            hovered.data.map(({ key, value }, index) =>
                                <tr key={index}>
                                    <th className="text-light text-right">{key}:</th>
                                    <th className="pl1 text-bold text-left">{value}</th>
                                </tr>
                            )
                        :
                            [["key", 0], ["value", 1]].map(([propName, colIndex]) =>
                                <tr key={propName} className="">
                                    <th className="text-light text-right">{getFriendlyName(s.data.cols[colIndex])}:</th>
                                    <th className="pl1 text-bold text-left">{formatValue(hovered.data[propName], { column: s.data.cols[colIndex], jsx: true, majorWidth: 0 })}</th>
                                </tr>
                            )
                        }
                    </tbody>
                </table>
            </TooltipPopover>
        );
    }
}
