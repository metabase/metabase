/* @flow */

import React, { Component } from "react";

import FieldSearchInput from "metabase/containers/FieldSearchInput";
import RemappedValue from "metabase/containers/RemappedValue";

import Field from "metabase-lib/lib/metadata/Field";

type Props = {
    value: any,
    setValue: () => void,

    isEditing: bool,

    fields: Field[],
};

type State = {
    isFocused: bool,
};

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
        const { value, setValue, isEditing, fields, parentFocusChanged } = this.props;
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
