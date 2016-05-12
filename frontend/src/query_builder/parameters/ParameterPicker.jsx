import React, { Component, PropTypes } from 'react';
import cx from "classnames";
import _ from 'underscore';


export default class ParameterPicker extends Component {

    static propTypes = {
        parameter: PropTypes.object.isRequired,
        onChange: PropTypes.func.isRequired
    };

    render() {
        const { parameter } = this.props;

        return (
            <div className="pt1">
                <span className="mt3 h5 text-uppercase text-grey-3 text-bold">{parameter.name}:</span>
                <input
                    className="m1 p1 input h4 text-dark"
                    type="text"
                    value={parameter.value}
                    placeholder=""
                    onChange={(event) => this.props.onChange(event.target.value)}
                />
            </div>
        );
    }
}
