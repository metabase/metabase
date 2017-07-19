/* @flow */

import React, { Component } from "react";

import SearchInput from "metabase/containers/SearchInput";

import cx from "classnames";
import _ from "underscore";

type Props = {
    values: Array<string | null>,
    onValuesChange: (values: any[]) => void,
    validations: boolean[],
    placeholder?: string,
    multi?: boolean,
    onCommit: () => void
};

type State = {
    fieldString: string
};

export default class SearchPicker extends Component {
    props: Props;

    render() {
        const { values, onValuesChange, validations, field } = this.props;
        const hasInvalidValues = _.some(validations, v => v === false);

        return (
            <div className="FilterInput px1 pt1 relative">
                <SearchInput
                    className={cx("input block full border-purple", {
                        "border-error": hasInvalidValues
                    })}
                    value={values[0]}
                    onChange={value => onValuesChange([value])}
                    fieldId={field.id}
                    metadata={field.metadata}
                />
            </div>
        );
    }
}
