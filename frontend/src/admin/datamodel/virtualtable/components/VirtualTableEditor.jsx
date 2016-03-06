import React, { Component, PropTypes } from "react";
import _ from "underscore";

import AddFieldPickerSidePanel from "./AddFieldPickerSidePanel.jsx";
import CustomFieldSidePanel from "./CustomFieldSidePanel.jsx";
import JoinPickTableSidePanel from "./JoinPickTableSidePanel.jsx";
import JoinSetConditionSidePanel from "./JoinSetConditionSidePanel.jsx";
import PickBaseTableSidePanel from "./PickBaseTableSidePanel.jsx";
import TableFieldsManagerSidePanel from "./TableFieldsManagerSidePanel.jsx";

import NameAndDescription from "./NameAndDescription.jsx";
import Filters from "./Filters.jsx";
import Table from "metabase/visualizations/Table.jsx";
import Visualization from "metabase/visualizations/components/Visualization.jsx";


export default class VirtualTableEditor extends Component {

    static propTypes = {
        virtualTable: PropTypes.object,
        metadata: PropTypes.object,
        previewData: PropTypes.object
    };

    renderSidePanel() {
        const panels = {
            picking: AddFieldPickerSidePanel,
            custom: CustomFieldSidePanel,
            join: JoinPickTableSidePanel,
            joinCondition: JoinSetConditionSidePanel
        };

        let SidePanel, args;
        if (!this.props.virtualTable || !this.props.virtualTable.table_id) {
            // user hasn't picked the starting table yet, so force that to happen now
            return (
                <PickBaseTableSidePanel {...this.props} />
            );

        } else if (this.props.uiControls.showAddFieldPicker) {
            // user is trying to add a field of some sort
            switch (this.props.uiControls.showAddFieldPicker) {
                case "custom":
                    return (
                        <CustomFieldSidePanel
                            {...this.props}
                            expression={null}
                            display_name={null}
                            onSave={(field) => {
                                this.props.addCustomField(field);
                                this.props.setShowAddFieldPicker(null);
                            }}
                            onCancel={() => this.props.setShowAddFieldPicker(null)}
                        />
                    );
                case "join":
                    SidePanel = JoinPickTableSidePanel;
                    break;
                case "joinCondition":
                    SidePanel = JoinSetConditionSidePanel;
                    break;
                default:
                    SidePanel = AddFieldPickerSidePanel;
            }
            //SidePanel = panels[this.props.uiControls.showAddFieldPicker];

        } else if (this.props.uiControls.showEditFieldPicker) {
            // user is trying to edit a field of some sort (custom field or join clause)
            SidePanel = panels[this.props.uiControls.showAddFieldPicker];

        } else {
            // we are just showing the default field management side panel
            SidePanel = TableFieldsManagerSidePanel;
        }

        return (
            <SidePanel {...this.props} />
        );
    }

    isValid() {
        const { virtualTable } = this.props;
        return virtualTable && virtualTable.table_id && virtualTable.name && virtualTable.fields && virtualTable.fields.length > 0;
    }

    onCreateTable() {
        if (this.isValid()) {
            console.log("create that table yo!", this.props.virtualTable);
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
                        :type     "basic"
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
        const { metadata, previewData, virtualTable } = this.props;

        return (
            <div style={{position: "relative", width: "100%"}}>
                <div style={{position: "absolute", top: 0, bottom: 76, right: 0, left: 0}} className="wrapper clearfix pt4 pb2">
                    <div style={{height: "100%", width: 320}} className="VirtualTableSidePanel float-left">
                        {this.renderSidePanel()}
                    </div>

                    <div style={{position: "relative", height: "100%", marginLeft: 320}} className="VirtualTableMainContent">
                        <NameAndDescription 
                            name={virtualTable && virtualTable.name || null} 
                            description={virtualTable && virtualTable.description || null} 
                            namePlaceholder="Give your table a name"
                            descriptionPlaceholder="Give your table a description" 
                            disabled={!virtualTable || !virtualTable.table_id}
                            onChange={(name, description) => this.props.setNameAndDescription(name, description)}
                        />

                        <div className="bordered rounded p2 my2 inline-block">
                            <Filters
                                filters={virtualTable && virtualTable.filter || []}
                                tableMetadata={metadata && metadata.tableMetadata && metadata.tableMetadata.table || null}
                                onChange={(filters) => this.props.setFilters(filters)}
                            />
                        </div>

                        <div style={{position: "absolute", bottom: 0, top: 150, left: 0, right: 0}} className="pl4 pt2">
                            { previewData && false ?
                                <Visualization
                                    series={[{card: {display: "table", dataset_query: {type: "query", query: {aggregation: ["rows"]}}}, data: previewData.data}]}
                                    card={{display: "table", dataset_query: {type: "query", query: {aggregation: ["rows"]}}}}
                                    data={previewData.data}
                                />
                            :
                                /* This just renders a simple empty table as a placeholder until we actually have data to show */
                                <table style={{borderSpacing: 0}} className="full border-left border-top">
                                    <tbody>
                                        { _.range(10).map((j, idx1) => 
                                            <tr key={"r"+idx1}>
                                                { _.range(10).map((k, idx2) =>
                                                    <td key={"c"+idx2} className="p1 border-right border-bottom">&nbsp;</td>
                                                )}
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            }
                        </div>
                    </div>
                </div>

                <div style={{position: "absolute", bottom: 0, left: 0, right: 0}} className="wrapper py2 border-top">
                    <div className="flex align-center justify-between">
                        <div className="text-brand">
                            <a className="link">Help</a>
                        </div>

                        <div>
                            <a className="text-grey-3 text-bold">Cancel</a>
                            <a className="Button ml3" disabled={!this.isValid()} onClick={() => this.onCreateTable()}>Create Table</a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
