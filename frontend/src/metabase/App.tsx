import React, { ErrorInfo, ReactNode, useRef, useState } from "react";
import { connect } from "react-redux";
import { Location } from "history";

import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";

import ScrollToTop from "metabase/hoc/ScrollToTop";
import {
  Archived,
  GenericError,
  NotFound,
  Unauthorized,
} from "metabase/containers/ErrorPages";
import UndoListing from "metabase/containers/UndoListing";

import {
  getErrorPage,
  getIsAdminApp,
  getIsAppBarVisible,
  getIsNavBarVisible,
} from "metabase/selectors/app";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { initializeIframeResizer } from "metabase/lib/dom";

import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";
import StatusListing from "metabase/status/containers/StatusListing";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";

import { AppErrorDescriptor, State } from "metabase-types/store";

import { AppContainer, AppContent, AppContentContainer } from "./App.styled";

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

interface AppStateProps {
  errorPage: AppErrorDescriptor | null;
  isAdminApp: boolean;
  isAppBarVisible: boolean;
  isNavBarVisible: boolean;
}

interface AppRouterOwnProps {
  location: Location;
  children: ReactNode;
}

type AppProps = AppStateProps & AppRouterOwnProps;

const mapStateToProps = (
  state: State,
  props: AppRouterOwnProps,
): AppStateProps => ({
  errorPage: getErrorPage(state),
  isAdminApp: getIsAdminApp(state, props),
  isAppBarVisible: getIsAppBarVisible(state, props),
  isNavBarVisible: getIsNavBarVisible(state, props),
});

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
  errorPage,
  isAdminApp,
  isAppBarVisible,
  isNavBarVisible,
  children,
}: AppProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>();
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  useOnMount(() => {
    initializeIframeResizer();
  });

  return (
    <ErrorBoundary onError={setErrorInfo}>
      <ScrollToTop>
        <AppContainer className="spread">
          {isAppBarVisible && <AppBar isNavBarVisible={isNavBarVisible} />}
          <AppContentContainer
            isAdminApp={isAdminApp}
            isAppBarVisible={isAppBarVisible}
          >
            {isNavBarVisible && <Navbar />}
            <AppContent ref={setViewportElement}>
              <ContentViewportContext.Provider value={viewportElement ?? null}>
                {errorPage ? getErrorComponent(errorPage) : children}
              </ContentViewportContext.Provider>
            </AppContent>
            <UndoListing />
            <StatusListing />
          </AppContentContainer>
          <AppErrorCard errorInfo={errorInfo} />
        </AppContainer>
      </ScrollToTop>
    </ErrorBoundary>
  );
}

export default connect<AppStateProps, unknown, AppRouterOwnProps, State>(
  mapStateToProps,
)(App);
