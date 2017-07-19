/* @flow */

import React, { Component } from "react";

import SearchInput from "metabase/containers/SearchInput";

import cx from "classnames";
import _ from "underscore";

import Field from "metabase-lib/lib/metadata/Field";

type Props = {
    values: Array<string | null>,
    onValuesChange: (values: any[]) => void,
    placeholder?: string,
    onCommit: () => void,

    field: Field,
};

export default class SearchPicker extends Component {
    props: Props;

    render() {
        const { values, onValuesChange, field, placeholder } = this.props;

        return (
            <div className="FilterInput px1 pt1 relative">
                <SearchInput
                    className={cx("input block full border-purple")}
                    value={values[0]}
                    onChange={value => onValuesChange([value])}
                    fieldId={field.id}
                    metadata={field.metadata}
                    placeholder={placeholder}
                />
            </div>
        );
    }
}
