/* @flow */

import React, { Component } from "react";

import FieldSearchInput from "metabase/containers/FieldSearchInput";
import FieldValuesWidget from "metabase/components/FieldValuesWidget";

import cx from "classnames";

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
                <FieldSearchInput
                    className={cx("input block full border-purple")}
                    value={values[0]}
                    onChange={value => onValuesChange([value])}
                    placeholder={placeholder}

                    field={field}
                    searchField={field.searchField()}
                />
                <FieldValuesWidget
                  value={values}
                  onChange={onValuesChange}
                  field={field}
                />
            </div>
        );
    }
}
