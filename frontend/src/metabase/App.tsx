import type { Location } from "history";
import { KBarProvider } from "kbar";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { connect } from "react-redux";

import { AppBanner } from "metabase/components/AppBanner";
import {
  Archived,
  GenericError,
  KeyboardTriggeredErrorModal,
  NotFound,
  Unauthorized,
} from "metabase/components/ErrorPages";
import { UndoListing } from "metabase/containers/UndoListing";
import { ContentViewportContext } from "metabase/core/context/ContentViewportContext";
import CS from "metabase/css/core/index.css";
import ScrollToTop from "metabase/hoc/ScrollToTop";
import { initializeIframeResizer } from "metabase/lib/dom";
import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";
import { setErrorPage } from "metabase/redux/app";
import {
  getErrorPage,
  getIsAdminApp,
  getIsAppBarVisible,
  getIsNavBarEnabled,
} from "metabase/selectors/app";
import StatusListing from "metabase/status/components/StatusListing";
import type { AppErrorDescriptor, State } from "metabase-types/store";

import { AppContainer, AppContent, AppContentContainer } from "./App.styled";
import ErrorBoundary from "./ErrorBoundary";
import { NewModals } from "./new/components/NewModals/NewModals";
import { Palette } from "./palette/components/Palette";

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
  isNavBarEnabled: boolean;
}

interface AppDispatchProps {
  onError: (error: unknown) => void;
}

interface AppRouterOwnProps {
  location: Location;
  children: ReactNode;
}

type AppProps = AppStateProps & AppDispatchProps & AppRouterOwnProps;

const mapStateToProps = (
  state: State,
  props: AppRouterOwnProps,
): AppStateProps => ({
  errorPage: getErrorPage(state),
  isAdminApp: getIsAdminApp(state, props),
  isAppBarVisible: getIsAppBarVisible(state, props),
  isNavBarEnabled: getIsNavBarEnabled(state, props),
});

const mapDispatchToProps: AppDispatchProps = {
  onError: setErrorPage,
};

function App({
  errorPage,
  isAdminApp,
  isAppBarVisible,
  isNavBarEnabled,
  children,
  onError,
}: AppProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>();

  useEffect(() => {
    initializeIframeResizer();
  }, []);

  return (
    <ErrorBoundary onError={onError}>
      <ScrollToTop>
        <KBarProvider>
          <KeyboardTriggeredErrorModal />
          <AppContainer className={CS.spread}>
            <AppBanner />
            {isAppBarVisible && <AppBar />}
            <AppContentContainer isAdminApp={isAdminApp}>
              {isNavBarEnabled && <Navbar />}
              <AppContent ref={setViewportElement}>
                <ContentViewportContext.Provider
                  value={viewportElement ?? null}
                >
                  {errorPage ? getErrorComponent(errorPage) : children}
                </ContentViewportContext.Provider>
              </AppContent>
              <UndoListing />
              <StatusListing />
              <NewModals />
            </AppContentContainer>
          </AppContainer>
          <Palette />
        </KBarProvider>
      </ScrollToTop>
    </ErrorBoundary>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<AppStateProps, unknown, AppRouterOwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(App);
