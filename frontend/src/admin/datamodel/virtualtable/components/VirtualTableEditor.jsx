import React, { Component, PropTypes } from "react";
import cx from "classnames";

import NameAndDescription from "./NameAndDescription.jsx";
import Filters from "./Filters.jsx";
import VirtualTablePreview from "./VirtualTablePreview.jsx";
import VirtualTableSidePanel from "./VirtualTableSidePanel.jsx";


export default class VirtualTableEditor extends Component {

    static propTypes = {
        virtualTable: PropTypes.object,
        metadata: PropTypes.object,
        previewData: PropTypes.object
    };

    isValid() {
        const { virtualTable } = this.props;
        return virtualTable && virtualTable.table_id && virtualTable.display_name && virtualTable.fields && virtualTable.fields.length > 0;
    }

    onCreateTable() {
        if (this.isValid()) {
            alert("create that table yo!");
            console.log("creating table", this.props.virtualTable);
        }
    }

    /*
        total possible = base table fields + joined table fields + custom defined fields (these are IDs of physical fields)
        visible fields = checked fields from each above (ultimately these are IDs of the fields specific to this table)
        !!!  The IDs between the 2 tables above are different !!!

        // what does it mean to uncheck a field and save?  or check a field and save?
        
        {:id          <vt-table-id>
         :table_id    <real-table-id of base table>
         :name        "My Table"
         :description "Some lengthy description"
         :fields      [{:id       <vt-field-id>
                        :field_id <real-field-id>
                        :type     "basic"
                        :included true
                        :active   true}
                       {:id       <vt-field-id>
                        :field_id <real-field-id>
                        :type     "joined"
                        :included false
                        :active   false}
                       {:id         <vt-field-id>
                        :field_id   nil
                        :type       "custom"
                        :expression ["-" 717 413]
                        :included   false
                        :active     true}]
         :joins       [{:source_field_id <real-field-id from base table>
                        :target_table_id <real-table-id of target table>
                        :target_field_id <real-field-id from target table>
                        :join_type       "left-outer"}]
         :filters     ["AND" [">" ["value" 0] 312]]}
        
        field states = inactive (deleted), active-not-checked (part of a filter, etc), active-checked
        isChecked = vt-fields.contains(real-field-id) && vt-field.is-checked
        unchecking a field in a VT is just a shorthand for marking it as hidden/do-not-include

        should we expect the full list of fields on all api calls to update a VT?  meaning fields not included get deactivated?  fields included but not existing get added.  everything else gets updated?
        should we simplify things and simply include all possible fields in the VT?  and simply mark them with their state, even if they aren't used?

        ugh.  what happens when a VT is based on Table-A and Table-A gets a new column?  does it automatically get added to the VT?  when would that happen?

        {:table_id    123
         :name        "My Table"
         :description "Some lengthy description"
         :fields      [{:id {:display_name "Pitcher ERA"
                        :expression   ["-" 717 413]
                        :visible      true}]
         :custom      [{:display_name "Pitcher ERA"
                        :expression   ["-" 717 413]
                        :visible      true}]
         :joins       [{:source_field_id 56
                        :target_table_id 456
                        :target_field_id 1432
                        :join_type       "left outer"
                        :fields          [1432 1433 1437 1441]}]
         :filter       ["AND" [">" ["value" 0] 312]]}
    */

    render() {
        const { metadata, virtualTable } = this.props;

        return (
            <div style={{position: "relative", width: "100%"}}>
                <div style={{position: "absolute", top: 0, bottom: 76, right: 0, left: 0}} className="wrapper clearfix pt4 pb2">
                    <div style={{height: "100%", width: 320}} className="VirtualTableSidePanel float-left">
                        <VirtualTableSidePanel {...this.props} />
                    </div>

                    <div style={{position: "relative", height: "100%", marginLeft: 320}} className="VirtualTableMainContent">
                        <NameAndDescription 
                            name={virtualTable && virtualTable.display_name || null} 
                            description={virtualTable && virtualTable.description || null} 
                            namePlaceholder="Give your table a name"
                            descriptionPlaceholder="Give your table a description" 
                            disabled={!virtualTable || !virtualTable.table_id}
                            onChange={(name, description) => this.props.setNameAndDescription(name, description)}
                        />

                        <div className="bordered rounded p2 my2 inline-block">
                            <Filters
                                filters={virtualTable && virtualTable.filters || []}
                                tableMetadata={metadata && virtualTable && metadata[virtualTable.table_id] && metadata[virtualTable.table_id].table || null}
                                onChange={(filters) => this.props.setFilters(filters)}
                            />
                        </div>

                        <div style={{position: "absolute", bottom: 0, top: 150, left: 0, right: 0}} className="pl4 pt2">
                            <VirtualTablePreview {...this.props} />
                        </div>
                    </div>
                </div>

                <div style={{position: "absolute", bottom: 0, left: 0, right: 0}} className="wrapper py2 border-top">
                    <div className="flex align-center justify-between">
                        <div className="text-brand">
                            <a className="link">Help</a>
                        </div>

                        <div>
                            <a className="text-grey-3 no-decoration text-bold" href={"/admin/datamodel/database/"+this.props.databaseId}>Cancel</a>
                            <button className={cx("Button ml3", {"Button--primary": this.isValid()})} type="button" disabled={!this.isValid()} onClick={() => this.onCreateTable()}>Create Table</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
