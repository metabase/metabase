/* @flow */
/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";

import { createMultiwordSearchRegex } from "metabase/lib/string";

import ListSearchField from "metabase/components/ListSearchField.jsx";

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

export default class CategoryWidget extends Component<*, Props, State> {
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

    static format(value) {
        return value;
    }

    render() {
        let { values, setValue, onClose } = this.props;

        let filteredValues = [];
        let regex = this.state.searchRegex;

        if (regex) {
            for (const value of values) {
                if (regex.test(value)) {
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
                          placeholder="Find a value"
                          autoFocus={true}
                      />
                  </div>
                }
                <ul className="scroll-y scroll-show" style={{ maxHeight: 300 }}>
                    {filteredValues.map(value =>
                        <li
                            key={value}
                            className="px2 py1 bg-brand-hover text-white-hover cursor-pointer"
                            onClick={() => { setValue(value); onClose(); }}
                        >
                            {value}
                        </li>
                     )}
                </ul>
            </div>
        );
    }
}
