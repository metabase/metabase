import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

export default class SearchBar extends React.Component {
  constructor(props, context) {
    super(props, context);
    this.handleInputChange = this.handleInputChange.bind(this);
    this.filterTextInput = React.createRef();
  }

  static propTypes = {
    filter: PropTypes.string.isRequired,
    onFilter: PropTypes.func.isRequired,
  };

  handleInputChange() {
    this.props.onFilter(this.filterTextInput.current.value);
  }

  render() {
    return (
      <input
        className="SearchBar"
        type="text"
        ref={this.filterTextInput}
        value={this.props.filter}
        placeholder={t`Search for`}
        onChange={this.handleInputChange}
      />
    );
  }
}
