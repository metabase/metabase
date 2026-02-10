import type { Location } from "history";
import { KBarProvider } from "kbar";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { AppBanner } from "metabase/common/components/AppBanner";
import {
  Archived,
  GenericError,
  KeyboardTriggeredErrorModal,
  NotFound,
  Unauthorized,
} from "metabase/common/components/ErrorPages";
import { UndoListing } from "metabase/common/components/UndoListing";
import { ContentViewportContext } from "metabase/common/context/ContentViewportContext";
import CS from "metabase/css/core/index.css";
import ScrollToTop from "metabase/hoc/ScrollToTop";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { initializeIframeResizer } from "metabase/lib/dom";
import { connect, useSelector } from "metabase/lib/redux";
import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";
import { PLUGIN_METABOT } from "metabase/plugins";
import { setErrorPage } from "metabase/redux/app";
import {
  getErrorPage,
  getIsAdminApp,
  getIsAppBarVisible,
  getIsDataStudioApp,
  getIsNavBarEnabled,
} from "metabase/selectors/app";
import { getApplicationName } from "metabase/selectors/whitelabel";
import StatusListing from "metabase/status/components/StatusListing";
import type { AppErrorDescriptor, State } from "metabase-types/store";

import { AppContainer, AppContent, AppContentContainer } from "./App.styled";
import ErrorBoundary from "./ErrorBoundary";
import { useTokenRefresh } from "./api/utils/use-token-refresh";
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
  isDataStudioApp: boolean;
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
  isDataStudioApp: getIsDataStudioApp(state, props),
  isAppBarVisible: getIsAppBarVisible(state, props),
  isNavBarEnabled: getIsNavBarEnabled(state, props),
});

const mapDispatchToProps: AppDispatchProps = {
  onError: setErrorPage,
};

function App({
  errorPage,
  isAdminApp,
  isDataStudioApp,
  isAppBarVisible,
  isNavBarEnabled,
  children,
  onError,
}: AppProps) {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>();
  const applicationName = useSelector(getApplicationName);

  usePageTitle(applicationName, { titleIndex: 0 });
  useTokenRefresh();

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
              <PLUGIN_METABOT.Metabot hide={isAdminApp || isDataStudioApp} />
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
