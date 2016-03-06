import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";


export default class AddFieldPickerSidePanel extends Component {

    render() {
        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div style={{flexGrow: "1"}}>
                    <div className="py3 pl3 pr1 flex flex-row align-center border-bottom cursor-pointer" onClick={() => this.props.uiEditCustomField({source: "custom"})}>
                        <div className="pr2">
                        	<h3>Add a custom or calculated field</h3>
                        	<span>Use math, functions, or string manipulation to create a custom field.</span>
                        </div>
                        <div className="List-item-arrow flex align-center text-grey-2">
                            <Icon name="chevronright" width={20} height={36} />
                        </div>
                    </div>

                    <div className="py3 pl3 pr1 flex flex-row align-center border-bottom cursor-pointer" onClick={() => this.props.uiEditJoin({source: "join"})}>
                        <div className="pr2">
                        	<h3>Add fields through a join</h3>
                        	<span>Combine the current working table with another table.</span>
                        </div>
                        <div className="List-item-arrow flex align-center text-grey-2">
                            <Icon name="chevronright" width={20} height={36} />
                        </div>
                    </div>
                </div>

                <div className="p1 border-top">
	            	<a className="Button Button--primary full text-centered" onClick={() => this.props.uiCancelEditing(null)}>Cancel</a>
	            </div>
            </div>
        );
    }
}
