import React, { Component } from "react";
import PropTypes from "prop-types";

import ColumnItem from "./ColumnItem.jsx";

export default class ColumnsList extends Component {
    static propTypes = {
        tableMetadata: PropTypes.object,
        idfields: PropTypes.array,
        updateField: PropTypes.func.isRequired,
        updateFieldSpecialType: PropTypes.func.isRequired,
        updateFieldTarget: PropTypes.func.isRequired
    };

    render() {
        let { tableMetadata } = this.props;
        return (
            <div id="ColumnsList" className="my3">
                <h2 className="px1 text-orange">Columns</h2>
                <div className="text-uppercase text-grey-3 py1">
                    <div style={{minWidth: 420}} className="float-left px1">Column</div>
                    <div className="flex clearfix">
                        <div className="flex-half px1">Visibility</div>
                        <div className="flex-half px1">Type</div>
                    </div>
                </div>
                <ol className="border-top border-bottom">
                    {tableMetadata.fields.map((field) =>
                        <ColumnItem
                            key={field.id}
                            field={field}
                            idfields={this.props.idfields}
                            updateField={this.props.updateField}
                            updateFieldSpecialType={this.props.updateFieldSpecialType}
                            updateFieldTarget={this.props.updateFieldTarget}
                        />
                    )}
                </ol>
            </div>
        );
    }
}
