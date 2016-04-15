import React, { Component, PropTypes } from "react";

import AddFieldPickerSidePanel from "./AddFieldPickerSidePanel.jsx";
import CustomFieldSidePanel from "./CustomFieldSidePanel.jsx";
import JoinPickTableSidePanel from "./JoinPickTableSidePanel.jsx";
import JoinSetConditionSidePanel from "./JoinSetConditionSidePanel.jsx";
import PickBaseTableSidePanel from "./PickBaseTableSidePanel.jsx";
import TableFieldsManagerSidePanel from "./TableFieldsManagerSidePanel.jsx";


export default class VirtualTableEditor extends Component {

    static propTypes = {
        virtualTable: PropTypes.object,
        metadata: PropTypes.object,
        previewData: PropTypes.object
    };

    render() {
        const { metadata, uiControls, virtualTable } = this.props;

        let SidePanel;
        if (!virtualTable || !virtualTable.table_id) {
            // user hasn't picked the starting table yet, so force that to happen now
            return (
                <PickBaseTableSidePanel {...this.props} />
            );

        } else if (uiControls.editing) {
            const editing = uiControls.editing;
            // not shown = null
            // picking = {}
            // custom (add) = {source: "custom"}
            // custom (edit) = {source: "custom", expression: "", display_name: ""}
            // join (add) = same as above
            // join (edit) = same as above

            // user is trying to add a field of some sort
            if (editing.source === "custom") {
                    return (
                        <CustomFieldSidePanel
                            {...this.props}
                            expression={editing.expression || null}
                            display_name={editing.display_name || null}
                            onSave={editing.hash ? 
                                (field) => this.props.updateCustomField({ ...editing, ...field })
                                :
                                (field) => this.props.addCustomField(field)
                            }
                            onDelete={editing.hash ? () => this.props.removeCustomField(editing) : null}
                            onCancel={() => this.props.uiCancelEditing()}
                        />
                    );

            } else if (editing.join_type) {
                if (editing.target_table_id) {
                    // target join table is already chosen, so we are working on join condition
                    SidePanel = JoinSetConditionSidePanel;
                    return (
                        <JoinSetConditionSidePanel
                            {...this.props}
                            sourceTable={metadata[virtualTable.table_id]}
                            targetTable={metadata[editing.target_table_id]}
                            join_type={editing.join_type}
                            onSave={editing.target_field_id ?
                                (join) => this.props.updateJoin({ ...editing, ...join})
                                :
                                (join) => this.props.addJoin({ ...editing, ...join})
                            }
                            onDelete={editing.target_field_id ? () => this.props.removeJoin(editing) : null}
                            onCancel={() => this.props.uiCancelEditing()}
                        />
                    );
                } else {
                    // no target join table yet, this must be a new join we are defining
                    SidePanel = JoinPickTableSidePanel;
                }
            } else {
                // this should only happen when there is no 'source' on the editing, meaning we are staring a new workflow
                SidePanel = AddFieldPickerSidePanel;
            }

        } else {
            // we are just showing the default field management side panel
            SidePanel = TableFieldsManagerSidePanel;
        }

        return (
            <SidePanel {...this.props} />
        );
    }
}
