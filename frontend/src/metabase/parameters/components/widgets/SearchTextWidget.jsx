/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";

import FieldSearchInput from "metabase/containers/FieldSearchInput";
import RemappedValue from "metabase/containers/RemappedValue";

import { getMetadata } from "metabase/selectors/metadata";

import type { FieldId } from "metabase/meta/types/Field";

type Props = {
    value: any,
    setValue: () => void,

    isEditing: bool,

    fields: Field[],
};

type State = {
    isFocused: bool,
};

const mapStateToProps = (state) => ({
    metadata: getMetadata(state)
})

@connect(mapStateToProps)
export default class SearchTextWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            isFocused: false,
        };
    }

    static noPopover = true;

    static format(value, field) {
        return <RemappedValue value={value} column={field} />
    }

    render() {
        // $FlowFixMe: metadata provided by @connect
        const { value, setValue, isEditing, fields, metadata, parentFocusChanged } = this.props;
        const { isFocused } = this.state;
        const field = fields[0];

        const defaultPlaceholder = isFocused ? "" : (this.props.placeholder || t`Enter a value...`);

        const focusChanged = (isFocused) => {
            if (parentFocusChanged) parentFocusChanged(isFocused);
            this.setState({isFocused})
        };

        if (!isFocused && value) {
            return (
                <div className="flex-full" onClick={() => focusChanged(true)}>
                    {SearchTextWidget.format(value, field)}
                </div>
            );
        } else {

            return (
                <FieldSearchInput
                    value={value}
                    onChange={setValue}
                    isFocused={isFocused}
                    onFocus={() => focusChanged(true)}
                    onBlur={() => focusChanged(false)}
                    autoFocus={this.state.isFocused}
                    placeholder={isEditing ? "Enter a default value..." : defaultPlaceholder}
                    field={field}
                    searchField={field && field.parameterSearchField()}
                />
            )
        }
    }
}
