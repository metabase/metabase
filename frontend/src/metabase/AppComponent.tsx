import { useEffect, useState } from "react";

import { useGetSettingsQuery } from "metabase/api";
import { AppBarContainer } from "metabase/app/nav/AppBar";
import { Navbar } from "metabase/app/nav/Navbar";
import {
  getIsAdminApp,
  getIsAppBarVisible,
  getIsDataApp,
  getIsDataStudioApp,
  getIsMonitorApp,
  getIsNavBarEnabled,
} from "metabase/app/selectors";
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
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import type { AppErrorDescriptor } from "metabase/redux/store";
import { Outlet, useLocation } from "metabase/router";
import { getErrorPage } from "metabase/selectors/app";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { StatusListing } from "metabase/status/components/StatusListing";
import { initializeIframeResizer } from "metabase/utils/dom";

import { AppContainer, AppContent, AppContentContainer } from "./App.styled";
import { AppKBarProvider } from "./AppKBarProvider";
import ErrorBoundary from "./ErrorBoundary";
import { trackPageView } from "./analytics";
import { useTokenRefresh } from "./api/utils/use-token-refresh";
import { Metabot } from "./metabot/components/Metabot";
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

export function App() {
  const [viewportElement, setViewportElement] = useState<HTMLElement | null>();
  const dispatch = useDispatch();
  const applicationName = useSelector(getApplicationName);

  // These selectors derive the active app section from the URL, so they take
  // the router props rather than reading them from the store.
  const location = useLocation();
  const routerProps = { location };
  const errorPage = useSelector(getErrorPage);
  const isAdminApp = useSelector((state) => getIsAdminApp(state, routerProps));
  const isDataStudioApp = useSelector((state) =>
    getIsDataStudioApp(state, routerProps),
  );
  const isMonitorApp = useSelector((state) =>
    getIsMonitorApp(state, routerProps),
  );
  const isDataApp = useSelector((state) => getIsDataApp(state, routerProps));
  const isAppBarVisible = useSelector((state) =>
    getIsAppBarVisible(state, routerProps),
  );
  const isNavBarEnabled = useSelector((state) =>
    getIsNavBarEnabled(state, routerProps),
  );

  const onError = (error: unknown) => dispatch(setErrorPage(error));
  const { pathname } = location;

  usePageTitle(applicationName, { titleIndex: 0 });
  useTokenRefresh();
  // App-wide subscription that keeps the settings cache alive for the whole
  // session and makes `session-properties` invalidations refetch.
  // In RTK if there is no active subscriber, invalidating a tag does not trigger a refetch.
  useGetSettingsQuery();

  useEffect(() => {
    initializeIframeResizer();
  }, []);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return (
    <ErrorBoundary onError={onError}>
      <ScrollToTop>
        <AppKBarProvider>
          <KeyboardTriggeredErrorModal />
          <AppContainer className={CS.spread}>
            <AppBanner />
            {isAppBarVisible && <AppBarContainer />}
            <AppContentContainer isAdminApp={isAdminApp}>
              {isNavBarEnabled && <Navbar />}
              <AppContent ref={setViewportElement}>
                <ContentViewportContext.Provider
                  value={viewportElement ?? null}
                >
                  {errorPage ? getErrorComponent(errorPage) : <Outlet />}
                </ContentViewportContext.Provider>
              </AppContent>
              <UndoListing />
              <StatusListing />
              <NewModals />
              <Metabot
                hide={
                  isAdminApp || isDataStudioApp || isMonitorApp || isDataApp
                }
              />
            </AppContentContainer>
          </AppContainer>
          <Palette />
        </AppKBarProvider>
      </ScrollToTop>
    </ErrorBoundary>
  );
}
