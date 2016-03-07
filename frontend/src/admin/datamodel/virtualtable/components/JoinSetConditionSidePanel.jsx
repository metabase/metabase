import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import ButtonGroup from "metabase/components/ButtonGroup.jsx";
import Icon from "metabase/components/Icon.jsx";

import TableFieldList from "./TableFieldList.jsx";


export default class JoinSetConditionSidePanel extends Component {

    static propTypes = {
        sourceTable: PropTypes.object.isRequired,
        targetTable: PropTypes.object.isRequired,
        source_field_id: PropTypes.number,
        target_field_id: PropTypes.number,
        join_type: PropTypes.string,
        onDelete: PropTypes.func,
        onSave: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired,
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            showDeleteConfirmModal: false,
            sourceFieldId: props.source_field_id || null,
            targetFieldId: props.target_field_id || null,
            joinType: props.join_type || "inner"
        };
    }

    isValid() {
        const { sourceFieldId, targetFieldId, joinType } = this.state;
        return sourceFieldId && targetFieldId && joinType;
    }

    onAddJoin() {
        if (this.isValid()) {
            this.props.onSave({
                source_field_id: this.state.sourceFieldId,
                target_table_id: this.props.targetTable.id,
                target_field_id: this.state.targetFieldId,
                join_type: this.state.joinType
            });
        }
    }

    render() {
        const { sourceTable, targetTable } = this.props;
        const { sourceFieldId, targetFieldId, joinType } = this.state;

        // join table has been picked, now detail the join condition
        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div style={{flexGrow: "1"}} className="p2">
                    <div className="AdminList-search pb4">
                        Which field in the current data matches a field from {targetTable.display_name}?
                    </div>

                    <div className="pb4">
                        <h5 className="text-uppercase text-grey-4 pb1">Current Fields</h5>
                        <label className="Select full">
                            <select defaultValue={sourceFieldId} onChange={(e) => this.setState({sourceFieldId: e.target.value})}>
                                {sourceTable.fields.map(f => <option key={f.id} value={f.id}>{f.display_name}</option>)}
                            </select>
                        </label>

                        <div className="h1 text-centered">=</div>

                        <h5 className="text-uppercase text-grey-4 pb1">{targetTable.display_name} Fields</h5>
                        <label className="Select full">
                            <select defaultValue={targetFieldId} onChange={(e) => this.setState({targetFieldId: e.target.value})}>
                                {targetTable.fields.map(f => <option key={f.id} value={f.id}>{f.display_name}</option>)}
                            </select>
                        </label>
                    </div>

                    <h5 className="text-uppercase text-grey-4 pb1 pt2">What kind of join do you want to do?</h5>
                    <label className="Select full">
                        <select defaultValue={joinType} onChange={(e) => this.setState({joinType: e.target.value})}>
                            <option value="inner">Inner Join</option>
                            <option value="left">Left outer join</option>
                            <option value="left-exclude">Left outer join, excluding matches</option>
                            <option value="full">Full outer join</option>
                            <option value="full-exclude">Full outer join, excluding matches</option>
                        </select>
                    </label>
                </div>

                <div className="p1 border-top">
                    <button className={cx("Button px4", {"Button--primary": this.isValid()})} type="button" disabled={!this.isValid()} onClick={() => this.onAddJoin()}>Join the tables</button>
                    <span className="px1">or</span>
                    <a className="link text-bold" onClick={() => this.props.uiCancelEditing()}>Cancel</a>
                </div>
            </div>
        );
    }
}
