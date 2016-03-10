import React, { Component, PropTypes } from 'react';

import _ from 'underscore';

import Icon from "metabase/components/Icon.jsx";
import FieldWidget from './FieldWidget.jsx';
import SelectionModule from './SelectionModule.jsx';

export default class CustomFieldWidget extends Component {
    constructor(props, context) {
        super(props, context);

        _.bindAll(this, 'setField', 'setOperator');
    }

    static propTypes = {
        customField: PropTypes.array.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        fieldOptions: PropTypes.object.isRequired,
        updateCustomField: PropTypes.func.isRequired,
        removeCustomField: PropTypes.func.isRequired,
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        this.setState({
            operator: newProps.customField[0],
            args: _.rest(newProps.customField)
        });
    }

    // DISABLED FOR RIGHT NOW - This seems to remove the component every time you change any of the options,
    // so you're never able to set all 3 (?)
    /*
    /// remove partially completed add_fields
    componentWillUnmount() {
        console.log('CustomFieldWidget.componentWillUnmount()');
        // for the time being, assume every custom field function has exactly 2 args.
        // down the road, we should tweak this to handle a valid range of args for each function
        // e.g. '+' can have more than 2 args, or a 'uppercase' function would only take a single arg
        if (!this.state.operator || !this.state.args || !this.state.args[0] || !this.state.args[1]) {
            this.props.removeCustomField();
        }
    }
    */

    setField(index, fieldID) {
        if (this.state.args[index][1] === fieldID) return;

        var args = this.state.args;
        console.log('args ->', args);

        args[index][1] = fieldID;
        this.setState({
            args: args
        });

        this.props.updateCustomField([this.state.operator, ...args]);
    }

    fieldWidgetForIndex(index) {
        var firstEmptyArgIndex = undefined;
        if (this.state.args) {
            for (var i = 0; i < this.state.args.length; i++) {
                if (this.state.args[i] === null) {
                    firstEmptyArgIndex = i;
                    break;
                }
            }
        }

        return (
            <FieldWidget
                className="Filter-section Filter-section-sort-field SelectionModule"
                tableMetadata={this.props.tableMetadata}
                field={this.state.args[index][1]}
                fieldOptions={this.props.fieldOptions}
                setField={_.partial(this.setField, index)}
                isInitiallyOpen={firstEmptyArgIndex === index}
                enableTimeGrouping={false}
            />
        );
    }

    setOperator(value) {
        if (this.state.operator === value) return;

        this.props.updateCustomField([value, ...this.state.args]);

        this.setState({operator: value});
    }

    render() {
        const OPERATORS = [
            {key: '+', val: '+'},
            {key: '-', val: '-'},
            {key: '÷', val: '/'},
            {key: '×', val: '*'}
        ];

        return (
            <div className="flex align-center">
                {this.fieldWidgetForIndex(0)}

                <SelectionModule
                    className="Filter-section Filter-section-sort-direction"
                    placeholder="..."
                    items={OPERATORS}
                    display="key"
                    selectedValue={this.state.operator}
                    selectedKey="val"
                    isInitiallyOpen={false}
                    action={this.setOperator}
                />

                {this.fieldWidgetForIndex(1)}

                <a onClick={this.props.removeCustomField}>
                    <Icon name='close' width="12px" height="12px" />
                </a>
            </div>
        );
    }
}
