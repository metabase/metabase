import React, { Component, PropTypes } from 'react';
import cx from "classnames";
import _ from 'underscore';

import FieldList from "../FieldList.jsx";

import Query from "metabase/lib/query";
import Utils from "metabase/lib/utils";


export default class ParameterWidgetNative extends Component {

    static propTypes = {
        parameter: PropTypes.object,
        tableMetadata: PropTypes.object,
        onSetParameter: PropTypes.func.isRequired,
        onRemoveParameter: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired
    };

    static defaultProps = {
        parameter: {
            hash: Utils.uuid()
        },
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
        return (parameter && !_.isEmpty(parameter.name) && !error);
    }

    render() {
        const { parameter } = this.state;
        const { tableMetadata } = this.props;

        return (
            <div style={{maxWidth: "500px"}}>
                <div className="p2">
                    <div className="mt3 h5 text-uppercase text-grey-3 text-bold">Variable Name</div>
                    <div>
                        <input
                            className="my1 p1 input block full h4 text-dark"
                            type="text"
                            value={parameter && parameter.name || ""}
                            placeholder="Date Created"
                            onChange={(event) => this.setState({parameter: {...parameter, name: event.target.value}})}
                        />
                    </div>
                </div>

                <div className="mt2 p2 border-top flex flex-row align-center justify-between">
                    <div>
                        <button
                            className={cx("Button", {"Button--primary": this.isValid()})}
                            onClick={() => this.props.onSetParameter(this.state.parameter)}
                            disabled={!this.isValid()}>{this.props.parameter && this.props.parameter.name ? "Update" : "Done"}</button>
                        <span className="pl1">or</span> <a className="link" onClick={() => this.props.onCancel()}>Cancel</a>
                    </div>
                </div>
            </div>
        );
    }
}
