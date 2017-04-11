import React, { Component } from "react";
import PropTypes from "prop-types";

export default class ProgressBar extends Component {
    static propTypes = {
        percentage: PropTypes.number.isRequired
    };

    static defaultProps = {
        className: "ProgressBar"
    };

    render() {
        return (
            <div className={this.props.className}>
                <div className="ProgressBar-progress" style={{"width": (this.props.percentage * 100) + "%"}}></div>
            </div>
        );
    }
}
