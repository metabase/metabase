import React, { Component, PropTypes } from "react";

export default React.createClass({
    displayName: 'SearchBar',
    propTypes: {
        filter: PropTypes.string.isRequired,
        onFilter: PropTypes.func.isRequired
    },
    handleInputChange: function () {
        this.props.onFilter(this.refs.filterTextInput.getDOMNode().value);
    },
    render: function () {
        return (
            <input className="SearchBar" type="text" ref="filterTextInput" value={this.props.filter} placeholder="Search for" onChange={this.handleInputChange}/>
        );
    }
});
