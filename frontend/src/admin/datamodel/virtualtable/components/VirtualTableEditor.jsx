import React, { Component, PropTypes } from "react";

import AddFieldPickerSidePanel from "./AddFieldPickerSidePanel.jsx";
import CustomFieldSidePanel from "./CustomFieldSidePanel.jsx";
import JoinTableSidePanel from "./JoinTableSidePanel.jsx";
import PickBaseTableSidePanel from "./PickBaseTableSidePanel.jsx";
import TableFieldsManagerSidePanel from "./TableFieldsManagerSidePanel.jsx";

import NameAndDescription from "./NameAndDescription.jsx";
import Filters from "./Filters.jsx";
import Table from "metabase/visualizations/Table.jsx";
import Visualization from "metabase/visualizations/components/Visualization.jsx";


export default class VirtualTableEditor extends Component {

    static propTypes = {
        virtualTable: PropTypes.object,
        databaseMetadata: PropTypes.object,
        previewData: PropTypes.object
    };

    renderSidePanel() {
        const panels = {
            picking: AddFieldPickerSidePanel,
            custom: CustomFieldSidePanel,
            join: JoinTableSidePanel
        };

        let SidePanel;
        if (!this.props.virtualTable || !this.props.virtualTable.table_id) {
            // user hasn't picked the starting table yet, so force that to happen now
            SidePanel = PickBaseTableSidePanel;
        } else if (this.props.showAddFieldPicker) {
            // user is adding a field of some sort
            SidePanel = panels[this.props.showAddFieldPicker];
        } else {
            // we are just showing the default field management side panel
            SidePanel = TableFieldsManagerSidePanel;
        }

        return (
            <SidePanel {...this.props} />
        );
    }

    render() {
        const { metadata, previewData, virtualTable } = this.props;

        return (
            <div style={{position: "relative", width: "100%"}}>
                <div style={{position: "absolute", top: 0, bottom: 76, right: 0, left: 0}} className="wrapper clearfix pt4 pb2">
                    <div style={{height: "100%", width: 320}} className="VirtualTableSidePanel float-left">
                        {this.renderSidePanel()}
                    </div>

                    <div style={{position: "relative", height: "100%", marginLeft: 320}} className="VirtualTableMainContent">
                        { virtualTable && virtualTable.table_id &&
                            <NameAndDescription 
                                name={virtualTable.name} 
                                description={virtualTable.description} 
                                namePlaceholder="Give your table a name"
                                descriptionPlaceholder="Give your table a description" 
                                onChange={(name, description) => this.props.setNameAndDescription(name, description)}
                            />
                        }

                        { virtualTable && metadata.tableMetadata &&
                            <div className="bordered rounded p2 my2 inline-block">
                                <Filters
                                    filters={virtualTable.filters}
                                    tableMetadata={metadata.tableMetadata.table}
                                    onChange={(filters) => this.props.setFilters(filters)}
                                />
                            </div>
                        }

                        { previewData &&
                            <div style={{position: "absolute", bottom: 0, top: 150, left: 0, right: 0}} className="pl4 pt2">
                                <Visualization
                                    series={[{card: {display: "table", dataset_query: {type: "query", query: {aggregation: ["rows"]}}}, data: previewData.data}]}
                                    card={{display: "table", dataset_query: {type: "query", query: {aggregation: ["rows"]}}}}
                                    data={previewData.data}
                                />
                            </div>
                        }
                    </div>
                </div>

                <div style={{position: "absolute", bottom: 0, left: 0, right: 0}} className="wrapper py2 border-top">
                    <div className="flex align-center justify-between">
                        <div className="text-brand">
                            <a className="link">Help</a>
                        </div>

                        <div>
                            <a className="text-grey-3 text-bold">Cancel</a>
                            <a className="Button ml3">Create Table</a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
