import React, { Component, ErrorInfo } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { Location } from "history";

import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";

import ScrollToTop from "metabase/hoc/ScrollToTop";
import {
  Archived,
  NotFound,
  GenericError,
  Unauthorized,
} from "metabase/containers/ErrorPages";
import UndoListing from "metabase/containers/UndoListing";

import { getErrorPage } from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import { getIsEditing as getIsEditingDashboard } from "metabase/dashboard/selectors";
import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";
import StatusListing from "metabase/status/containers/StatusListing";

import { User } from "metabase-types/api";
import { AppErrorDescriptor, State } from "metabase-types/store";

import { AppContentContainer, AppContent } from "./App.styled";

const getErrorComponent = ({ status, data, context }: AppErrorDescriptor) => {
  if (status === 403) {
    return <Unauthorized />;
  }
  if (status === 404 || data?.error_code === "not-found") {
    return <NotFound />;
  }
  if (data?.error_code === "archived" && context === "dashboard") {
    return <Archived entityName="dashboard" linkTo="/dashboards/archive" />;
  }
  if (data?.error_code === "archived" && context === "query-builder") {
    return <Archived entityName="question" linkTo="/questions/archive" />;
  }
  return <GenericError details={data?.message} />;
};

const PATHS_WITHOUT_NAVBAR = [/\/model\/.*\/query/, /\/model\/.*\/metadata/];

const EMBEDDED_ROUTES_WITH_NAVBAR = ["/collection", "/archive"];

interface AppStateProps {
  currentUser?: User;
  errorPage: AppErrorDescriptor | null;
  isEditingDashboard: boolean;
}

interface AppRouterOwnProps {
  location: Location;
}

type AppProps = AppStateProps & AppRouterOwnProps;

function mapStateToProps(state: State): AppStateProps {
  return {
    currentUser: getUser(state),
    errorPage: getErrorPage(state),
    isEditingDashboard: getIsEditingDashboard(state),
  };
}

class App extends Component<AppProps> {
  state = {
    errorInfo: undefined,
  };

  constructor(props: AppProps) {
    super(props);
    initializeIframeResizer();
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
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

export default connect<AppStateProps, unknown, AppRouterOwnProps, State>(
  mapStateToProps,
)(App);
