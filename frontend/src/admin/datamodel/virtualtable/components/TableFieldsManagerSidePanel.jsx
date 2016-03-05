import React, { Component, PropTypes } from "react";
import _ from "underscore";

import ButtonGroup from "metabase/components/ButtonGroup.jsx";
import Icon from "metabase/components/Icon.jsx";

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

    onAddField() {

    }

    render() {
        const { metadata, virtualTable } = this.props;

        return (
            <div className="flex flex-column">
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
                    <div>
                        <ButtonGroup 
                            className="Button-group--blue"
                            items={[{name: "FIELDS BY TABLE", value: "table"}, {name: "FIELDS BY ORDER", value: "position"}]}
                            onChange={(item) => this.onSetFieldOrdering(item.value)}
                        />
                    </div>

                    <div style={{maxHeight: "320px"}} className="pt1 scroll-y">
                        {/* Always rendering the base table and its fields as the first table. */}
                        {metadata.tableMetadata && metadata.tableMetadata.table &&
                            <TableFieldList
                                table={metadata.tableMetadata.table}
                                canAction={() => false}
                                onAction={() => null}
                                fieldIsChecked={(field) => _.contains(virtualTable.fields, field.id)}
                                onFieldToggleChecked={(field, checked) => checked ? this.props.includeField(field.id) : this.props.excludeField(field.id) }
                                fieldCanAction={() => false}
                                onFieldAction={(field) => null}
                            />
                        }
                    </div>
                </div>

                <div className="p1 border-top">
	            	<a className="Button Button--primary full text-centered" onClick={() => this.props.setShowAddFieldPicker("picking")}>Add more fields</a>
	            </div>
            </div>
        );
    }
}
