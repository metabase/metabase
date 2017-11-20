/* @flow weak */

import React, {Component} from "react";
import {connect} from "react-redux";

import Navbar from "metabase/nav/containers/Navbar.jsx";

import UndoListing from "metabase/containers/UndoListing";

import NotFound from "metabase/components/NotFound.jsx";
import Unauthorized from "metabase/components/Unauthorized.jsx";
import Archived from "metabase/components/Archived.jsx";

const mapStateToProps = (state, props) => ({
    errorPage: state.app.errorPage
});

const getErrorComponent = ({status, data, context}) => {
    if (status === 403) {
        return <Unauthorized />
    } else if (data && data.error_code === "archived" && context === "dashboard") {
        return <Archived entityName="dashboard" linkTo="/dashboards/archive" />
    } else if (data && data.error_code === "archived" && context === "query-builder") {
        return <Archived entityName="question" linkTo="/questions/archive" />
    } else {
        return <NotFound />
    }
}

@connect(mapStateToProps)
export default class App extends Component {
    state = {
        hasError: false
    }

    componentDidCatch(error, info) {
        this.setState({ hasError: true });
        console.error(error, info);
    }

    render() {
        const { children, location, errorPage } = this.props;

        if (this.state.hasError) {
            return <div>😢</div>
        }

        return (
            <div className="spread flex flex-column">
                <Navbar location={location} className="flex-no-shrink"/>
                { errorPage ? getErrorComponent(errorPage) : children }
                <UndoListing />
            </div>
        )
    }
}
