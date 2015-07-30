'use strict';
/*global _*/

import Input from "./Input.react";
import MetadataField from "./MetadataField.react";

import cx from "classnames";

export default React.createClass({
    displayName: "MetadataSchema",
    propTypes: {
        table: React.PropTypes.object,
        metadata: React.PropTypes.object
    },

    render: function() {
        var table = this.props.table;
        if (!table) {
            return false;
        }

        var fields;
        if (this.props.metadata) {
            fields = this.props.metadata.fields.map((field) => {
                return (
                    <li key={field.id} className="px1 py2 flex border-bottom">
                        <div className="TableEditor-column-column flex flex-column mr1">
                            <span className="TableEditor-field-name text-bold">{field.name}</span>
                        </div>
                        <div className="TableEditor-column-type">
                            <span className="text-bold">{field.base_type}</span>
                        </div>
                        <div className="TableEditor-column-details">
                        </div>
                    </li>
                );
            });
        }

        return (
            <div className="MetadataTable px2 flex-full">
                <div className="flex flex-column px1">
                    <div className="TableEditor-table-name text-bold">{this.props.table.name}</div>
                </div>
                <div className="mt2 ">
                    <div className="text-uppercase text-grey-3 py1 flex">
                        <div className="TableEditor-column-column px1">Column</div>
                        <div className="TableEditor-column-type px1">Data Type</div>
                        <div className="TableEditor-column-details px1">Additional Info</div>
                    </div>
                    <ol className="border-top border-bottom scroll-y">
                        {fields}
                    </ol>
                </div>
            </div>
        );
    }
});
