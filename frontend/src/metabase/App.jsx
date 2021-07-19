/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import ScrollToTop from "metabase/hoc/ScrollToTop";
import Navbar from "metabase/nav/containers/Navbar";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import UndoListing from "metabase/containers/UndoListing";
import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";

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
    errorInfo: undefined,
  };

  constructor(props) {
    super(props);
    initializeIframeResizer();
  }

  componentDidCatch(error, errorInfo) {
    console.log("COMPONENT DID CATCH LOLE");
    this.setState({ errorInfo });
  }

  render() {
    const { children, currentUser, location, errorPage } = this.props;
    const { errorInfo } = this.state;

    return (
      <ScrollToTop>
        <div className="relative">
          {currentUser && !IFRAMED && <Navbar location={location} />}
          {errorPage ? getErrorComponent(errorPage) : children}
          <UndoListing />
        </div>
        <AppErrorCard errorInfo={errorInfo} />
      </ScrollToTop>
    );
  }
}
