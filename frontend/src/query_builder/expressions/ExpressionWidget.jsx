import React, { Component, PropTypes } from 'react';
import cx from "classnames";
import _ from 'underscore';

import ExpressionEditorTextfield from "./ExpressionEditorTextfield.jsx";


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
        expression: [null, ""],
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
        const { name, expression } = this.state;
        return (!_.isEmpty(name) && expression[0] && expression[0][0] && expression[1]); // huh?
    }

    render() {
        const { expression } = this.state;

        return (
            <div style={{maxWidth: "500px"}}>
                <div className="p2">
                    <div className="h5 text-uppercase text-grey-3 text-bold">Field formula</div>
                    <div>
                        <ExpressionEditorTextfield
                            expression={expression}
                            tableMetadata={this.props.tableMetadata}
                            onChange={(parsedExpression, expressionString) => this.setState({expression: [parsedExpression, expressionString]})}
                        />
                        <p className="h5 text-grey-2">
                            Think of this as being kind of like writing a forumla in a spreadsheet program: you can use numbers, fields in this table,
                            mathematic symbols like +, and some functions.  So you could type, Subtotal - Cost.  <a className="link" href="">Learn more</a>
                        </p>
                    </div>

                    <div className="mt3 h5 text-uppercase text-grey-3 text-bold">Give it a name</div>
                    <div>
                        <input
                            className="my1 p1 input block full h4 text-dark"
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
                            disabled={!this.isValid()}>{this.props.expression[0] ? "Save changes" : "Done"}</button>
                        <span className="pl1">or</span> <a className="link" onClick={() => this.props.onCancel()}>Cancel</a>
                    </div>
                    <div>
                        {this.props.expression[0] ?
                         <a className="pr2 text-warning link" onClick={() => this.props.onRemoveExpression(this.props.name)}>Remove</a>
                         : null }
                    </div>
                </div>
            </div>
        );
    }
}
