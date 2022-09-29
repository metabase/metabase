import React, { ErrorInfo, ReactNode, useRef, useState } from "react";
import { t } from "ttag";
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

import AppBanner from "metabase/components/AppBanner";
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
  bannerMessageDescriptor?: string;
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
  onError: (errorInfo: ErrorInfo & Error) => void;
  countError: () => void;
}> {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError({ ...error, componentStack: errorInfo.componentStack });
    this.props.countError();
  }

  render() {
    return this.props.children;
  }
}

const MAX_ERRORS_ALLOWED = 3;

function App({
  errorPage,
  isAdminApp,
  isAppBarVisible,
  isNavBarVisible,
  children,
}: AppProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>();
  const [errorInfo, setErrorInfo] = useState<(ErrorInfo & Error) | null>(null);
  const [errorCount, setErrorCount] = useState(0);

  const countError = () => setErrorCount(prev => prev + 1);

  useOnMount(() => {
    initializeIframeResizer();
  });

  return (
    <ErrorBoundary onError={setErrorInfo} countError={countError}>
      <ScrollToTop>
        <AppContainer className="spread">
          <AppBanner />
          {isAppBarVisible && <AppBar isNavBarVisible={isNavBarVisible} />}
          <AppContentContainer isAdminApp={isAdminApp}>
            {isNavBarVisible && <Navbar />}
            {errorCount < MAX_ERRORS_ALLOWED ? (
              <AppContent ref={setViewportElement}>
                <ContentViewportContext.Provider
                  value={viewportElement ?? null}
                >
                  {errorPage ? getErrorComponent(errorPage) : children}
                </ContentViewportContext.Provider>
              </AppContent>
            ) : (
              getErrorComponent({
                status: 500,
                data: {
                  error_code: "looping error",
                  message:
                    (errorInfo?.message ?? "") +
                    " " +
                    (errorInfo?.componentStack ?? ""),
                },
              })
            )}
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
