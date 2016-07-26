import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";


export default class ListSearchField extends Component {

    static propTypes = {
        onChange: PropTypes.func.isRequired,
        placeholder: PropTypes.string,
        searchText: PropTypes.string
    };

    static defaultProps = {
        className: "bordered rounded text-grey-2 flex flex-full align-center",
        inputClassName: "p1 h4 input--borderless text-default flex-full",
        placeholder: "Find a table",
        searchText: ""
    };

    render() {
        const { className, inputClassName, onChange, placeholder, searchText } = this.props;

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
                />
            </div>
        );
    }
}
