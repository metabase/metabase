import React, { Component, PropTypes } from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon.jsx";


export default class CustomFieldSidePanel extends Component {

    render() {
        const { metadata, virtualTable } = this.props;

        return (
            <div className="flex flex-column justify-between">
                <div className="p2">
                	<h5 className="text-uppercase text-grey-4 pb1">Field Formula</h5>
                	<input
                        className={cx("input block full border-blue")}
                        type="text"
                        value={""}
                        onChange={(e) => null}
                        placeholder={"= write your expression"}
                        autoFocus={true}
                    />
                    <div className="py2">
                    	Think of this as being kind of like writing a formula in a spreadsheet program: 
                    	you can use numbers, fields in this table, mathmatic symbols like +, and some functions.  
                    	So you could type, Subtotal - Cost.
                    	<a className="link block">Learn more</a>
                    </div>

                    <h5 className="text-uppercase text-grey-4 pb1 pt2">Name your field</h5>
                    <input
                        className={cx("input block full")}
                        type="text"
                        value={""}
                        onChange={(e) => null}
                        placeholder={"You can change this whenever"}
                    />
                </div>

                <div className="p1 border-top">
	            	<a className="Button px4">Add Field</a>
	            	<span className="px1">or</span>
	            	<a className="link text-bold" onClick={() => this.props.setShowAddFieldPicker(null)}>Cancel</a>
	            </div>
            </div>
        );
    }
}
