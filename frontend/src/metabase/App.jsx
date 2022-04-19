/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";

import ScrollToTop from "metabase/hoc/ScrollToTop";
import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";

import {
  Archived,
  NotFound,
  GenericError,
  Unauthorized,
} from "metabase/containers/ErrorPages";
import UndoListing from "metabase/containers/UndoListing";
import StatusListing from "metabase/status/containers/StatusListing";

import { getIsEditing as getIsEditingDashboard } from "metabase/dashboard/selectors";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import { AppContentContainer, AppContent } from "./App.styled";

const mapStateToProps = state => ({
  currentUser: state.currentUser,
  errorPage: state.app.errorPage,
  isEditingDashboard: getIsEditingDashboard(state),
});

const getErrorComponent = ({ status, data, context }) => {
  if (status === 403) {
    return <Unauthorized />;
  } else if (status === 404 || data?.error_code === "not-found") {
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

const PATHS_WITHOUT_NAVBAR = [/\/model\/.*\/query/, /\/model\/.*\/metadata/];

const EMBEDDED_ROUTES_WITH_NAVBAR = ["/collection", "/archive"];

class App extends Component {
  state = {
    errorInfo: undefined,
  };

  constructor(props) {
    super(props);
    initializeIframeResizer();
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

  isAdminApp = () => {
    const { pathname } = this.props.location;
    return pathname.startsWith("/admin/");
  };

  hasNavbar = () => {
    const {
      currentUser,
      isEditingDashboard,
      location: { pathname },
    } = this.props;
    if (!currentUser || isEditingDashboard) {
      return false;
    }
    if (IFRAMED) {
      return EMBEDDED_ROUTES_WITH_NAVBAR.some(path =>
        pathname.startsWith(path),
      );
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  };

  hasAppBar = () => {
    const {
      currentUser,
      location: { pathname },
      isEditingDashboard,
    } = this.props;
    if (!currentUser || IFRAMED || this.isAdminApp() || isEditingDashboard) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  };

  render() {
    const { children, errorPage } = this.props;
    const { errorInfo } = this.state;
    const hasAppBar = this.hasAppBar();
    return (
      <ScrollToTop>
        {errorPage ? (
          getErrorComponent(errorPage)
        ) : (
          <>
            {hasAppBar && <AppBar />}
            <AppContentContainer
              hasAppBar={hasAppBar}
              isAdminApp={this.isAdminApp()}
            >
              {this.hasNavbar() && <Navbar />}
              <AppContent>{children}</AppContent>
              <UndoListing />
              <StatusListing />
            </AppContentContainer>
          </>
        )}
        <AppErrorCard errorInfo={errorInfo} />
      </ScrollToTop>
    );
  }
}

export default connect(mapStateToProps)(App);
