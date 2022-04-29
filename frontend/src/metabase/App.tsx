import React, { ErrorInfo, ReactNode, useMemo, useState } from "react";
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
import { useOnMount } from "metabase/hooks/use-on-mount";
import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";
import StatusListing from "metabase/status/containers/StatusListing";

import { User } from "metabase-types/api";
import { AppErrorDescriptor, State } from "metabase-types/store";

import { AppContentContainer, AppContent } from "./App.styled";

const getErrorComponent = ({ status, data, context }: AppErrorDescriptor) => {
  if (status === 403 || data?.error_code === "unauthorized") {
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

const HOMEPAGE_PATTERN = /^\/$/;
const EMBEDDED_ROUTES_WITH_NAVBAR = [
  HOMEPAGE_PATTERN,
  /^\/collection\/.*/,
  /^\/archive/,
];

interface AppStateProps {
  currentUser?: User;
  errorPage: AppErrorDescriptor | null;
  isEditingDashboard: boolean;
}

interface AppRouterOwnProps {
  location: Location;
  children: ReactNode;
}

type AppProps = AppStateProps & AppRouterOwnProps;

function mapStateToProps(state: State): AppStateProps {
  return {
    currentUser: getUser(state),
    errorPage: getErrorPage(state),
    isEditingDashboard: getIsEditingDashboard(state),
  };
}

class ErrorBoundary extends React.Component<{
  onError: (errorInfo: ErrorInfo) => void;
}> {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError(errorInfo);
  }

  render() {
    return this.props.children;
  }
}

function App({
  currentUser,
  errorPage,
  location: { pathname, hash },
  isEditingDashboard,
  children,
}: AppProps) {
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  useOnMount(() => {
    initializeIframeResizer();
  });

  const isAdminApp = useMemo(() => pathname.startsWith("/admin/"), [pathname]);

  const hasNavbar = useMemo(() => {
    if (!currentUser || isEditingDashboard) {
      return false;
    }
    if (IFRAMED) {
      return EMBEDDED_ROUTES_WITH_NAVBAR.some(pattern =>
        pattern.test(pathname),
      );
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  }, [currentUser, pathname, isEditingDashboard]);

  const hasAppBar = useMemo(() => {
    const isFullscreen = hash.includes("fullscreen");
    if (
      !currentUser ||
      IFRAMED ||
      isAdminApp ||
      isEditingDashboard ||
      isFullscreen
    ) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  }, [currentUser, pathname, isEditingDashboard, isAdminApp, hash]);

  return (
    <ErrorBoundary onError={setErrorInfo}>
      <ScrollToTop>
        <div className="spread">
          {hasAppBar && <AppBar />}
          <AppContentContainer hasAppBar={hasAppBar} isAdminApp={isAdminApp}>
            {hasNavbar && <Navbar />}
            <AppContent>
              {errorPage ? getErrorComponent(errorPage) : children}
            </AppContent>
            <UndoListing />
            <StatusListing />
          </AppContentContainer>
          <AppErrorCard errorInfo={errorInfo} />
        </div>
      </ScrollToTop>
    </ErrorBoundary>
  );
}

export default connect<AppStateProps, unknown, AppRouterOwnProps, State>(
  mapStateToProps,
)(App);
