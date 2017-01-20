/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import { createMultiwordSearchRegex } from "metabase/lib/string";

import ListSearchField from "metabase/components/ListSearchField.jsx";
import _ from "underscore";

export default class CategoryWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            searchString: "",
            searchRegex: null
        };

        _.bindAll(this, "updateSearchText");
    }

    static propTypes = {
        value: PropTypes.any,
        values: PropTypes.array.isRequired,
        setValue: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired
    };

    updateSearchText(value) {
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
            _.each(values, (val) => {
                if (regex.test(val)) {
                    filteredValues.push(val);
                }
            });
        } else {
            filteredValues = values.slice();
        }

        return (
            <div>
                { values.length <= 10 && !regex ?
                  null :
                  <div className="px1 pt1">
                      <ListSearchField
                          onChange={this.updateSearchText}
                          searchText={this.state.searchText}
                          placeholder="Find a value"
                          autoFocus={true}
                      />
                  </div>
                }
                <ul className="scroll-y scroll-show" style={{ maxWidth: 200, maxHeight: 300 }}>
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
