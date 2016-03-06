import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import ButtonGroup from "metabase/components/ButtonGroup.jsx";
import Icon from "metabase/components/Icon.jsx";

import TableFieldList from "./TableFieldList.jsx";


export default class JoinSetConditionSidePanel extends Component {

    static propTypes = {
        joinClause: PropTypes.object,
        metadata: PropTypes.object.isRequired,
        virtualTable: PropTypes.object.isRequired
    };

    onAddJoin() {
        // final validation
        console.log("add join");
    }

    render() {
        const { metadata, uiControls, virtualTable } = this.props;

        // join table has been picked, now detail the join condition
        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div style={{flexGrow: "1"}} className="p2">
                    <div className="AdminList-search pb4">
                        Which field in the current data matches a field from {uiControls.joinTable.display_name}?
                    </div>

                    <div className="pb4">
                    	<h5 className="text-uppercase text-grey-4 pb1">Current Fields</h5>
                    	<input
                            className={cx("input block full border-blue")}
                            type="text"
                            value={""}
                            onChange={(e) => null}
                            placeholder={"= write your expression"}
                            autoFocus={true}
                        />

                        <div className="h1 text-centered">=</div>

                        <h5 className="text-uppercase text-grey-4 pb1">{uiControls.joinTable.display_name} Fields</h5>
                        <input
                            className={cx("input block full border-blue")}
                            type="text"
                            value={""}
                            onChange={(e) => null}
                            placeholder={"= write your expression"}
                            autoFocus={true}
                        />
                    </div>

                    <h5 className="text-uppercase text-grey-4 pb1 pt2">What kind of join do you want to do?</h5>
                    <input
                        className={cx("input block full")}
                        type="text"
                        value={""}
                        onChange={(e) => null}
                        placeholder={"You can change this whenever"}
                    />
                </div>

                <div className="p1 border-top">
	            	<a className="Button px4" onClick={() => this.onAddJoin()}>Join the tables</a>
	            	<span className="px1">or</span>
	            	<a className="link text-bold" onClick={() => this.props.setShowAddFieldPicker(null)}>Cancel</a>
	            </div>
            </div>
        );
    }
}
