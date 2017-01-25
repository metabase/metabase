/* @flow weak */

import React, { Component, PropTypes } from "react";

import Navbar from "metabase/nav/containers/Navbar.jsx";

import UndoListing from "metabase/containers/UndoListing";

export default class App extends Component {
    render() {
        const { children, location } = this.props;
        return (
            <div className="spread flex flex-column">
                <Navbar location={location} className="flex-no-shrink" />
                {children}
                <UndoListing />
            </div>
        )
    }
}
