'use strict';

import Icon from './icon.react';
import FieldWidget from './field_widget.react';
import SelectionModule from './selection_module.react';

import Query from './query';

export default React.createClass({
    displayName: 'SortWidget',
    propTypes: {
        sort: React.PropTypes.array.isRequired,
        fieldOptions: React.PropTypes.object.isRequired,
        tableName: React.PropTypes.string,
        updateSort: React.PropTypes.func.isRequired,
        removeSort: React.PropTypes.func.isRequired
    },

    componentWillMount: function() {
        this.componentWillReceiveProps(this.props);
    },

    componentWillReceiveProps: function(newProps) {
        this.setState({
            field: newProps.sort[0],           // id of the field
            direction: newProps.sort[1]        // sort direction
        });
    },

    setField: function(value) {
        if (this.state.field !== value) {
            this.props.updateSort([value, this.state.direction]);
        }
    },

    setDirection: function(value) {
        if (this.state.direction !== value) {
            this.props.updateSort([this.state.field, value]);
        }
    },

    render: function() {
        var directionOptions = [
            {key: "ascending", val: "ascending"},
            {key: "descending", val: "descending"},
        ];

        return (
            <div className="flex align-center">
                <FieldWidget
                    className="Filter-section Filter-section-sort-field SelectionModule"
                    tableName={this.props.tableName}
                    field={this.state.field}
                    fieldOptions={this.props.fieldOptions}
                    setField={this.setField}
                    isInitiallyOpen={this.state.field === null}
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
});
