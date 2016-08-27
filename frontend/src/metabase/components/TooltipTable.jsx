import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

export default class TooltipTable extends Component {
    static propTypes = {
        data: PropTypes.array.isRequired,
    };

    render() {
        let data = this.props.data;

        return (
            <table className="py1 px2">
                <tbody>
                    {data.map(({key, value}, index) =>
                        <tr key={index}>
                            <td className="text-light text-right">{key}:</td>
                            <td className="pl1 text-bold text-left">{value}</td>
                        </tr>
                    )}
                </tbody>
            </table>
        );
    }
}
