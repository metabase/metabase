import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import FieldWidget from './FieldWidget.jsx';
import SelectionModule from './SelectionModule.jsx';

export default class SortWidget extends Component {
    constructor(props, context) {
        super(props, context);
        this.setDirection = this.setDirection.bind(this);
        this.setField = this.setField.bind(this);
    }

    static propTypes = {
        sort: PropTypes.array.isRequired,
        fieldOptions: PropTypes.object.isRequired,
        tableName: PropTypes.string,
        updateSort: PropTypes.func.isRequired,
        removeSort: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        this.setState({
            field: newProps.sort[0],           // id of the field
            direction: newProps.sort[1]        // sort direction
        });
    }

    setField(value) {
        if (this.state.field !== value) {
            this.props.updateSort([value, this.state.direction]);
        }
    }

    setDirection(value) {
        if (this.state.direction !== value) {
            this.props.updateSort([this.state.field, value]);
        }
    }

    render() {
        var directionOptions = [
            {key: "ascending", val: "ascending"},
            {key: "descending", val: "descending"},
        ];

        return (
            <div className="flex align-center">
                <FieldWidget
                    className="Filter-section Filter-section-sort-field SelectionModule"
                    tableMetadata={this.props.tableMetadata}
                    field={this.state.field}
                    fieldOptions={this.props.fieldOptions}
                    setField={this.setField}
                    isInitiallyOpen={this.state.field === null}
                    enableTimeGrouping={false}
                />

                <SelectionModule
                    className="Filter-section Filter-section-sort-direction"
                    placeholder="..."
                    items={directionOptions}
                    display="key"
                    selectedValue={this.state.direction}
                    selectedKey="val"
                    isInitiallyOpen={false}
                    action={this.setDirection}
                />

                <a onClick={this.props.removeSort}>
                    <Icon name='close' width="12px" height="12px" />
                </a>
            </div>
        );
    }
}
