/* @flow */
/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";

import { createMultiwordSearchRegex } from "metabase/lib/string";
import { t } from 'c-3po';
import { getHumanReadableValue } from "metabase/lib/query/field";

import ListSearchField from "metabase/components/ListSearchField.jsx";

import cx from "classnames";

type Props = {
    value: any,
    values: any[],
    setValue: () => void,
    onClose: () => void
}
type State = {
    searchText: string,
    searchRegex: ?RegExp,
}

export default class CategoryWidget extends Component {
    props: Props;
    state: State;

    constructor(props: Props) {
        super(props);

        this.state = {
            searchText: "",
            searchRegex: null
        };
    }

    static propTypes = {
        value: PropTypes.any,
        values: PropTypes.array.isRequired,
        setValue: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired
    };

    updateSearchText = (value: string) => {
        let regex = null;

        if (value) {
            regex = createMultiwordSearchRegex(value);
        }

        this.setState({
            searchText: value,
            searchRegex: regex
        });
    }

    static format(value, fieldValues) {
        return getHumanReadableValue(value, fieldValues);
    }

    render() {
        let { value, values, setValue, onClose } = this.props;

        let filteredValues = [];
        let regex = this.state.searchRegex;

        if (regex) {
            for (const value of values) {
                if (regex.test(value[0]) || regex.test(value[1])) {
                    filteredValues.push(value);
                }
            }
        } else {
            filteredValues = values.slice();
        }

        return (
            <div style={{ maxWidth: 200 }}>
                { values.length > 10 &&
                  <div className="p1">
                      <ListSearchField
                          onChange={this.updateSearchText}
                          searchText={this.state.searchText}
                          placeholder={t`Find a value`}
                          autoFocus={true}
                      />
                  </div>
                }
                <ul className="scroll-y scroll-show" style={{ maxHeight: 300 }}>
                    {filteredValues.map(([rawValue, humanReadableValue]) =>
                        <li
                            key={rawValue}
                            className={cx("px2 py1 bg-brand-hover text-white-hover cursor-pointer", {
                                "text-white bg-brand": rawValue === value
                            })}
                            onClick={() => { setValue(rawValue); onClose(); }}
                        >
                            {humanReadableValue || String(rawValue)}
                        </li>
                     )}
                </ul>
            </div>
        );
    }
}
