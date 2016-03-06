import React, { Component, PropTypes } from "react";
import _ from "underscore";

import ButtonGroup from "metabase/components/ButtonGroup.jsx";
import Icon from "metabase/components/Icon.jsx";

import FieldList from "./FieldList.jsx";
import TableFieldList from "./TableFieldList.jsx";


export default class TableFieldsManagerSidePanel extends Component {
	constructor(props, context) {
        super(props, context);

        this.state = {
            searchText: "",
            fieldOrdering: "table"
        };
    }

    onSearch(text) {

    }

    onSetFieldOrdering(ordering) {
        if (this.state.fieldOrdering !== ordering) {
            this.setState({
                fieldOrdering: ordering
            });
        }
    }

    render() {
        const { metadata, virtualTable } = this.props;

        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div className="AdminList-search">
                    <Icon name="search" width="16" height="16"/>
                    <input
                        className="AdminInput pl4 border-bottom"
                        type="text"
                        placeholder="Find a field"
                        value={this.state.searchText}
                        onChange={this.onSearch}
                    />
                </div>

                <div className="p1">
                    <ButtonGroup 
                        className="Button-group--blue"
                        items={[{name: "FIELDS BY TABLE", value: "table"}, {name: "FIELDS BY ORDER", value: "position"}]}
                        onChange={(item) => this.onSetFieldOrdering(item.value)}
                    />
                </div>

                <div style={{flexGrow: "2"}} className="p1 scroll-y">
                    {/* Always rendering the base table and its fields as the first table. */}
                    {virtualTable && virtualTable.fields && virtualTable.fields.length > 0 &&
                        <TableFieldList
                            table={virtualTable}
                            fieldsFilterPredicate={(field) => field.source === "core"}
                            canAction={() => false}
                            onAction={() => null}
                            fieldIsChecked={(field) => field.included}
                            onFieldToggleChecked={(field, checked) => checked ? this.props.includeField(field) : this.props.excludeField(field) }
                            fieldCanAction={() => false}
                            onFieldAction={(field) => null}
                        />
                    }

                    {/* Always put any custom field definitions at the end */}
                    {virtualTable && virtualTable.fields && virtualTable.fields.length > 0 && _.some(virtualTable.fields, (f) => f.source === "custom") &&
                        <div className="pt2">
                            <h5 className="text-uppercase text-grey-4 pb1">Custom</h5>
                            <FieldList
                                fields={virtualTable.fields.filter((f) => f.source === "custom")}
                                isChecked={(field) => field.included}
                                onToggleChecked={(field, checked) => checked ? this.props.includeField(field) : this.props.excludeField(field)}
                                canAction={() => true}
                                onAction={(field) => this.props.uiEditCustomField(field)}
                            />
                        </div>
                    }
                </div>

                <div className="p1 border-top">
	            	<a className="Button Button--primary full text-centered" onClick={() => this.props.uiAddFieldChooser()}>Add more fields</a>
	            </div>
            </div>
        );
    }
}
