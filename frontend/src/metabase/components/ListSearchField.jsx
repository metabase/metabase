import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";
import { t } from "c-3po";

export default class ListSearchField extends Component {
  static propTypes = {
    onChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    searchText: PropTypes.string,
    autoFocus: PropTypes.bool,
  };

  static defaultProps = {
    className: "bordered rounded text-light flex flex-full align-center",
    inputClassName: "p1 h4 input--borderless text-default flex-full",
    placeholder: t`Find...`,
    searchText: "",
    autoFocus: false,
  };

  componentDidMount() {
    if (this.props.autoFocus) {
      // Call focus() with a small delay because instant input focus causes an abrupt scroll to top of page
      // when ListSearchField is used inside a popover. It seems that it takes a while for Tether library
      // to correctly position the popover.
      setTimeout(() => this._input && this._input.focus(), 50);
    }
  }

  render() {
    const {
      className,
      inputClassName,
      onChange,
      placeholder,
      searchText,
    } = this.props;

    return (
      <div className={className}>
        <span className="px1">
          <Icon name="search" size={16} />
        </span>
        <input
          className={inputClassName}
          type="text"
          placeholder={placeholder}
          value={searchText}
          onChange={e => onChange(e.target.value)}
          ref={input => (this._input = input)}
        />
      </div>
    );
  }
}
