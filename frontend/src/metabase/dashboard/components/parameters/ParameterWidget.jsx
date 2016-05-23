import React, { Component, PropTypes } from 'react';
import cx from "classnames";
import _ from 'underscore';

import Query from "metabase/lib/query";


export default class ParameterWidget extends Component {

    static propTypes = {
        parameter: PropTypes.object,
        tableMetadata: PropTypes.object.isRequired,
        onSetParameter: PropTypes.func.isRequired,
        onRemoveParameter: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired
    };

    static defaultProps = {
        parameter: null,
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        this.setState({
            parameter: newProps.parameter
        });
    }

    isValid() {
        const { parameter, error } = this.state;
        return (parameter && !_.isEmpty(parameter.name) && !error) ; //&& isExpression(expression));
    }

    setField(field) {
        console.log("setting field", field);
        if (_.isNumber(field)) {
            field = ["field-id", field];
        }

        let parameter = this.state.parameter;

        this.setState({
            parameter: {...parameter, field: field, value: "Widget"}
        });
    }

    render() {
        const { parameter } = this.state;
        const { tableMetadata } = this.props;

        return (
            <div style={{minWidth: "350px", maxWidth: "500px"}}>
                <div className="p2">
                    <div className="mt3 h5 text-uppercase text-grey-3 text-bold">Give it a name</div>
                    <div>
                        <input
                            className="my1 p1 input block full h4 text-dark"
                            type="text"
                            value={parameter && parameter.name || ""}
                            placeholder="Something nice and descriptive"
                            onChange={(event) => this.setState({parameter: {...parameter, name: event.target.value}})}
                        />
                    </div>
                </div>

                <div className="mt2 p2 border-top flex flex-row align-center justify-between">
                    <div>
                        <button
                            className={cx("Button", {"Button--primary": this.isValid()})}
                            onClick={() => this.props.onSetParameter(this.state.parameter)}
                            disabled={!this.isValid()}>{this.props.parameter ? "Update" : "Done"}</button>
                        <span className="pl1">or</span> <a className="link" onClick={() => this.props.onCancel()}>Cancel</a>
                    </div>
                    <div>
                        {this.props.parameter ?
                         <a className="pr2 text-warning link" onClick={() => this.props.onRemoveParameter(this.props.parameter)}>Remove</a>
                         : null }
                    </div>
                </div>
            </div>
        );
    }
}
