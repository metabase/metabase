/* @flow */

import React, { Component, PropTypes } from "react";

import type { FieldId } from "metabase/meta/types/Field";
import Metadata from "metabase-lib/lib/metadata/Metadata";

import SearchInput from "metabase/containers/SearchInput";

type Props = {
    value: any,
    setValue: () => void,

    isEditing: bool,

    fieldId: FieldId,
    metadata: Metadata,
};

type State = {
    focused: bool,
};

function getEntityName(fieldId, entityId) {
    return "TODO";
}

export default class SearchTextWidget extends Component<*, Props, State> {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);
        this.state = {
            focused: false,
        };
    }

    static noPopover = true;

    static format(entityId, fieldId) {
        const entityName = fieldId != null ? getEntityName(fieldId, entityId) : null;
        if (entityName != null) {
            return (
                <span>
                    <span className="text-bold">{entityName}</span>
                    <span style={{ opacity: 0.5 }}>{" - " + entityId}</span>
                </span>
            );
        } else {
            return entityId;
        }
    }

    render() {
        const { value, setValue, isEditing, fieldId } = this.props;
        const { focused } = this.state;

        if (!focused && value) {
            return (
                <div className="flex-full" onClick={() => this.setState({ focused: true })}>
                    {SearchTextWidget.format(value , fieldId)}
                </div>
            );
        } else {
            return (
                <SearchInput
                    value={value}
                    onChange={setValue}
                    onFocus={() => this.setState({ focused: true })}
                    onBlur={() => this.setState({ focused: false })}
                    autoFocus={this.state.focused}
                    placeholder={isEditing ? "Enter a default value..." : "Enter a value..."}

                    fieldId={fieldId}
                />
            )
        }
    }
}
