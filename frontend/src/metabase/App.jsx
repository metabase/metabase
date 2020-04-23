/* @flow weak */

import React, { Component } from "react";
import { connect } from "react-redux";
import ScrollToTop from "metabase/hoc/ScrollToTop";
import Navbar from "metabase/nav/containers/Navbar";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import UndoListing from "metabase/containers/UndoListing";

import {
  Archived,
  NotFound,
  GenericError,
  Unauthorized,
} from "metabase/containers/ErrorPages";

const mapStateToProps = (state, props) => ({
  errorPage: state.app.errorPage,
  currentUser: state.currentUser,
});

const getErrorComponent = ({ status, data, context }) => {
  if (status === 403) {
    return <Unauthorized />;
  } else if (status === 404) {
    return <NotFound />;
  } else if (
    data &&
    data.error_code === "archived" &&
    context === "dashboard"
  ) {
    return <Archived entityName="dashboard" linkTo="/dashboards/archive" />;
  } else if (
    data &&
    data.error_code === "archived" &&
    context === "query-builder"
  ) {
    return <Archived entityName="question" linkTo="/questions/archive" />;
  } else {
    return <GenericError details={data && data.message} />;
  }
};

@connect(mapStateToProps)
export default class App extends Component {
  state = {
    hasError: false,
  };

  componentWillMount() {
    initializeIframeResizer();
  }

  componentDidCatch(error, info) {
    console.error("Error caught in <App>", error, info);
    this.setState({ hasError: true });
  }

  render() {
    const { children, currentUser, location, errorPage } = this.props;

    if (this.state.hasError) {
      return <div>😢</div>;
    }

    return (
      <ScrollToTop>
        <div className="relative">
          {currentUser && !IFRAMED && <Navbar location={location} />}
          {errorPage ? getErrorComponent(errorPage) : children}
          <UndoListing />
        </div>
      </ScrollToTop>
    );
  }
}
