import React, { Component, PropTypes } from "react";

import ButtonGroup from "metabase/components/ButtonGroup.jsx";
import Icon from "metabase/components/Icon.jsx";

import FieldListByPosition from "./FieldListByPosition.jsx";
import FieldListByTable from "./FieldListByTable.jsx";


export default class TableFieldsManagerSidePanel extends Component {
	constructor(props, context) {
        super(props, context);

        this.state = {
            searchText: "",
            fieldOrdering: "table"
        };
    }

    onSetFieldOrdering(ordering) {
        if (this.state.fieldOrdering !== ordering) {
            this.setState({
                fieldOrdering: ordering
            });
        }
    }

    render() {
        const { virtualTable } = this.props;
        const { fieldOrdering, searchText } = this.state;

        let fields = (virtualTable && virtualTable.fields) ? virtualTable.fields : [];
        if (searchText) {
            fields = fields.filter((field) => field.display_name.toLowerCase().includes(searchText.toLowerCase()));
        }

        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div className="AdminList-search">
                    <Icon name="search" width="16" height="16"/>
                    <input
                        className="AdminInput pl4 border-bottom"
                        type="text"
                        placeholder="Find a field"
                        value={this.state.searchText}
                        onChange={(e) => this.setState({searchText: e.target.value})}
                    />
                </div>

                <div className="p1">
                    <ButtonGroup 
                        className="h6 p0 flex"
                        buttonClassName="Button text-brand text-centered flex-half"
                        items={[{name: "FIELDS BY TABLE", value: "table"}, {name: "FIELDS BY ORDER", value: "position"}]}
                        selectedItem={fieldOrdering}
                        onChange={(item) => this.onSetFieldOrdering(item.value)}
                    />
                </div>

                <div style={{flexGrow: "2"}} className="p1 scroll-y">
                    { fieldOrdering === "table" ?
                        <FieldListByTable
                            {...this.props}
                            fields={fields} />
                    :
                        <FieldListByPosition
                            {...this.props}
                            fields={fields} />
                    }
                </div>

                <div className="p1 border-top">
	            	<a className="Button Button--primary full text-centered" onClick={() => this.props.uiAddFieldChooser()}>Add more fields</a>
	            </div>
            </div>
        );
    }
}
