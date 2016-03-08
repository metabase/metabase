import React, { Component, PropTypes } from "react";

import FieldList from "./FieldList.jsx";


export default class FieldListByPosition extends Component {

    render() {
        const { fields } = this.props;

        return (
            <div>
                <FieldList
                    fields={fields}
                    isChecked={(field) => field.included}
                    onToggleChecked={(field, checked) => checked ? this.props.includeField(field) : this.props.excludeField(field)}
                    canAction={() => false}
                    reorderable={true}
                />
            </div>
        );
    }
}
