'use strict';
/*global _*/

import Input from "metabase/components/Input.react";
import MetadataField from "./MetadataField.react";

import cx from "classnames";

export default React.createClass({
    displayName: "MetadataSchema",
    propTypes: {
        table: React.PropTypes.object
    },

    render: function() {
        var table = this.props.table;
        if (!table) {
            return false;
        }

        var fields = this.props.table.fields.map((field) => {
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
                    <div className="TableEditor-table-name text-bold">{this.props.table.name}</div>
                </div>
                <div className="mt2 ">
                    <div className="text-uppercase text-grey-3 py1 flex">
                        <div className="flex-full px1">Column</div>
                        <div className="flex-half px1">Data Type</div>
                        <div className="flex-half px1">Additional Info</div>
                    </div>
                    <ol className="border-top border-bottom scroll-y">
                        {fields}
                    </ol>
                </div>
            </div>
        );
    }
});
