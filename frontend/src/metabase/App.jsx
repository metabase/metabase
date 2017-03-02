/* @flow weak */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Navbar from "metabase/nav/containers/Navbar.jsx";

import UndoListing from "metabase/containers/UndoListing";

import NotFound from "metabase/components/NotFound.jsx";
import Unauthorized from "metabase/components/Unauthorized.jsx";

const mapStateToProps = (state, props) => ({
    errorPage: state.app.errorPage
})

@connect(mapStateToProps)
export default class App extends Component {
    render() {
        const { children, location, errorPage } = this.props;
        return (
            <div className="spread flex flex-column">
                <Navbar location={location} className="flex-no-shrink" />
                { errorPage && errorPage.status === 403 ?
                    <Unauthorized />
                : errorPage ?
                    // TODO: different error page for non-404 errors
                    <NotFound />
                :
                    children
                }
                <UndoListing />
            </div>
        )
    }
}
