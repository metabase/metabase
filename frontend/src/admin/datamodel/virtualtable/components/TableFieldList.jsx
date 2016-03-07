import React, { Component, PropTypes } from "react";

import FieldList from "./FieldList.jsx";


export default class TableFieldList extends Component {

    static propTypes = {
        table: PropTypes.object.isRequired,
        fieldsFilterPredicate: PropTypes.func,
        canAction: PropTypes.func,
        onAction: PropTypes.func,

        // cascaded to FieldList
        fieldIsChecked: PropTypes.func,
        onFieldToggleChecked: PropTypes.func,
        fieldCanAction: PropTypes.func,
        onFieldAction: PropTypes.func
    };

    static defaultProps = {
        canAction: () => false
    };

    render() {
        const { table, fieldsFilterPredicate, canAction, onAction, fieldIsChecked, onFieldToggleChecked, fieldCanAction, onFieldAction } = this.props;

        if (!table || !table.fields) return;

        const fields = fieldsFilterPredicate ? table.fields.filter(fieldsFilterPredicate) : table.fields;
        return (
            <div>
                <h5 className="text-uppercase text-grey-4 pb1" onClick={canAction && onAction ? () => this.props.onAction() : null}>{table.display_name}</h5>
                <FieldList
                    fields={fields}
                    isChecked={fieldIsChecked}
                    onToggleChecked={onFieldToggleChecked}
                    canAction={fieldCanAction}
                    onAction={onFieldAction}
                />
            </div>
        );
    }
}
