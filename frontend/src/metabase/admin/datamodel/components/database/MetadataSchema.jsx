import React, { Component } from "react";
import PropTypes from "prop-types";

export default class MetadataSchema extends Component {
    static propTypes = {
        tableMetadata: PropTypes.object
    };

    render() {
        const { tableMetadata } = this.props;
        if (!tableMetadata) {
            return false;
        }

        var fields = tableMetadata.fields.map((field) => {
            return (
                <li key={field.id} className="px1 py2 flex border-bottom">
                    <div className="flex-full flex flex-column mr1">
                        <span className="TableEditor-field-name text-bold">{field.name}</span>
                    </div>
                    <div className="flex-half">
                        <span className="text-bold">{field.base_type}</span>
                    </div>
                    <div className="flex-half">
                    </div>
                </li>
            );
        });

        return (
            <div className="MetadataTable px2 flex-full">
                <div className="flex flex-column px1">
                    <div className="TableEditor-table-name text-bold">{tableMetadata.name}</div>
                </div>
                <div className="mt2 ">
                    <div className="text-uppercase text-grey-3 py1 flex">
                        <div className="flex-full px1">Column</div>
                        <div className="flex-half px1">Data Type</div>
                        <div className="flex-half px1">Additional Info</div>
                    </div>
                    <ol className="border-top border-bottom">
                        {fields}
                    </ol>
                </div>
            </div>
        );
    }
}
