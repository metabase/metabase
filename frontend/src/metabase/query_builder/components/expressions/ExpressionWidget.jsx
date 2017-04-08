import React, { Component } from 'react';
import PropTypes from "prop-types";
import cx from "classnames";
import _ from 'underscore';

import ExpressionEditorTextfield from "./ExpressionEditorTextfield.jsx";
import { isExpression } from "metabase/lib/expressions";


export default class ExpressionWidget extends Component {

    static propTypes = {
        expression: PropTypes.array,
        name: PropTypes.string,
        tableMetadata: PropTypes.object.isRequired,
        onSetExpression: PropTypes.func.isRequired,
        onRemoveExpression: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired
    };

    static defaultProps = {
        expression: null,
        name: ""
    }

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        this.setState({
            name: newProps.name,
            expression: newProps.expression
        });
    }

    isValid() {
        const { name, expression, error } = this.state;
        return (!_.isEmpty(name) && !error && isExpression(expression));
    }

    render() {
        const { expression } = this.state;

        return (
            <div style={{maxWidth: "600px"}}>
                <div className="p2">
                    <div className="h5 text-uppercase text-grey-3 text-bold">Field formula</div>
                    <div>
                        <ExpressionEditorTextfield
                            expression={expression}
                            tableMetadata={this.props.tableMetadata}
                            onChange={(parsedExpression) => this.setState({expression: parsedExpression, error: null})}
                            onError={(errorMessage) => this.setState({error: errorMessage})}
                        />
                        <p className="h5 text-grey-2">
                            Think of this as being kind of like writing a formula in a spreadsheet program: you can use numbers, fields in this table,
                            mathematical symbols like +, and some functions.  So you could type, Subtotal - Cost.
                            <a className="link" href="http://www.metabase.com/docs/latest/users-guide/03-asking-questions.html#creating-a-custom-field">Learn more</a>
                        </p>
                    </div>

                    <div className="mt3 h5 text-uppercase text-grey-3 text-bold">Give it a name</div>
                    <div>
                        <input
                            className="my1 input block full"
                            type="text"
                            value={this.state.name}
                            placeholder="Something nice and descriptive"
                            onChange={(event) => this.setState({name: event.target.value})}
                        />
                    </div>
                </div>

                <div className="mt2 p2 border-top flex flex-row align-center justify-between">
                    <div>
                        <button
                            className={cx("Button", {"Button--primary": this.isValid()})}
                            onClick={() => this.props.onSetExpression(this.state.name, this.state.expression)}
                            disabled={!this.isValid()}>{this.props.expression ? "Update" : "Done"}</button>
                        <span className="pl1">or</span> <a className="link" onClick={() => this.props.onCancel()}>Cancel</a>
                    </div>
                    <div>
                        {this.props.expression ?
                         <a className="pr2 text-warning link" onClick={() => this.props.onRemoveExpression(this.props.name)}>Remove</a>
                         : null }
                    </div>
                </div>
            </div>
        );
    }
}
