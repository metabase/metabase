import React from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";
import { t } from "c-3po";

export default class SearchBar extends React.Component {
  constructor(props, context) {
    super(props, context);
    this.handleInputChange = this.handleInputChange.bind(this);
  }

  static propTypes = {
    filter: PropTypes.string.isRequired,
    onFilter: PropTypes.func.isRequired,
  };

  handleInputChange() {
    this.props.onFilter(ReactDOM.findDOMNode(this.refs.filterTextInput).value);
  }

  render() {
    return (
      <input
        className="SearchBar"
        type="text"
        ref="filterTextInput"
        value={this.props.filter}
        placeholder={t`Search for`}
        onChange={this.handleInputChange}
      />
    );
  }
}
