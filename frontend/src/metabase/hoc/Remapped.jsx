import React, { Component } from "react";
import { connect } from "react-redux";

import { createSelector } from "reselect";

import { getMetadata } from "metabase/selectors/metadata";
import { fetchRemapping } from "metabase/redux/metadata";

const getField = createSelector(
    [getMetadata, (state, props) => props.column && props.column.id],
    (metadata, columnId) => metadata.fields[columnId]
);

const getDisplayValue = createSelector(
    [(state, props) => props.value, getField],
    (value, field) => field && field.remappedValue(value)
);
const getDisplayColumn = createSelector(
    [getField],
    field => field && field.remappedField()
);

const mapStateToProps = (state, props) => ({
    displayValue: getDisplayValue(state, props),
    displayColumn: getDisplayColumn(state, props)
});

const mapDispatchToProps = {
    fetchRemapping
};

export default ComposedComponent =>
    @connect(mapStateToProps, mapDispatchToProps)
    class extends Component {
        static displayName = "Remapped[" +
            (ComposedComponent.displayName || ComposedComponent.name) +
            "]";

        componentWillMount() {
            if (this.props.column) {
                this.props.fetchRemapping(
                    this.props.value,
                    this.props.column.id
                );
            }
        }
        componentWillReceiveProps(nextProps) {
            if (
                nextProps.column &&
                (this.props.value !== nextProps.value ||
                    this.props.column !== nextProps.column)
            ) {
                this.props.fetchRemapping(nextProps.value, nextProps.column.id);
            }
        }

        render() {
            let { displayValue, displayColumn, fetchRemapping, ...props } = this.props;
            if (displayValue === undefined) {
                displayColumn = null;
            }
            return (
                <ComposedComponent
                    {...props}
                    displayValue={displayValue}
                    displayColumn={displayColumn}
                />
            );
        }
    };
