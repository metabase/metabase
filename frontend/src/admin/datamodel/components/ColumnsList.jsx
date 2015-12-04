import React, { Component, PropTypes } from "react";

import ColumnItem from "./ColumnItem.jsx";

export default class ColumnsList extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        let { table } = this.props;
        return (
            <div>
                <h2 className="px1 text-orange">Columns</h2>
                <div className="text-uppercase text-grey-3 py1">
                    <div style={{minWidth: 420}} className="float-left px1">Column</div>
                    <div className="flex clearfix">
                        <div className="flex-half px1">Visibility</div>
                        <div className="flex-half px1">Type</div>
                        <div className="flex-half px1">Details</div>
                    </div>
                </div>
                <ol className="border-top border-bottom">
                    {table.fields.map((field) => {
                        return (
                            <ColumnItem
                                key={field.id}
                                field={field}
                                idfields={this.props.idfields}
                                updateField={this.props.updateField}
                                updateFieldSpecialType={this.props.updateFieldSpecialType}
                                updateFieldTarget={this.props.updateFieldTarget}
                            />
                        );
                    })}
                </ol>
            </div>
        );
    }
}
