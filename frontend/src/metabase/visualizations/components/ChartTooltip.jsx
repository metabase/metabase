import React, { Component } from "react";
import PropTypes from "prop-types";

import TooltipPopover from "metabase/components/TooltipPopover.jsx"
import Value from "metabase/components/Value.jsx";

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

    componentWillReceiveProps({ hovered }) {
        if (hovered && hovered.data && !Array.isArray(hovered.data)) {
            console.warn("hovered.data should be an array of { key, value, col }", hovered.data);
        }
    }

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
                            hovered.data.map(({ key, value, col }, index) =>
                                <TooltipRow
                                    key={index}
                                    name={key}
                                    value={value}
                                    column={col}
                                />
                            )
                        :
                            [["key", 0], ["value", 1]].map(([propName, colIndex]) =>
                                <TooltipRow
                                    key={propName}
                                    name={getFriendlyName(s.data.cols[colIndex])}
                                    value={hovered.data[propName]}
                                    column={s.data.cols[colIndex]}
                                />
                            )
                        }
                    </tbody>
                </table>
            </TooltipPopover>
        );
    }
}

const TooltipRow = ({ name, value, column }) =>
    <tr>
        <td className="text-light text-right">{name}:</td>
        <td className="pl1 text-bold text-left">
            { React.isValidElement(value) ?
                value
            :
                <Value
                    type="tooltip"
                    value={value}
                    column={column}
                    majorWidth={0}
                />
            }
        </td>
    </tr>
