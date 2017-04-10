import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";


export default class ListSearchField extends Component {

    static propTypes = {
        onChange: PropTypes.func.isRequired,
        placeholder: PropTypes.string,
        searchText: PropTypes.string,
        autoFocus: PropTypes.bool
    };

    static defaultProps = {
        className: "bordered rounded text-grey-2 flex flex-full align-center",
        inputClassName: "p1 h4 input--borderless text-default flex-full",
        placeholder: "Find...",
        searchText: "",
        autoFocus: false
    };

    render() {
        const { className, inputClassName, onChange, placeholder, searchText, autoFocus } = this.props;

        return (
            <div className={className}>
                <span className="px1">
                    <Icon name="search" size={16}/>
                </span>
                <input
                    className={inputClassName}
                    type="text"
                    placeholder={placeholder}
                    value={searchText}
                    onChange={(e) => onChange(e.target.value)}
                    autoFocus={autoFocus}
                />
            </div>
        );
    }
}
