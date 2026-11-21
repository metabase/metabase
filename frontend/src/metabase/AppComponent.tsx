import cx from "classnames";
import { Suspense, lazy, useEffect, useState } from "react";

import { AppBarContainer } from "metabase/app/nav/AppBar";
import { Navbar } from "metabase/app/nav/Navbar";
import {
  getIsAdminApp,
  getIsAppBarVisible,
  getIsDataApp,
  getIsDataStudioApp,
  getIsEmbeddingHubApp,
  getIsMonitorApp,
  getIsNavBarEnabled,
} from "metabase/app/nav/selectors";
import { useIsUsageAnalyticsContent } from "metabase/app/nav/use-is-usage-analytics-content";
import { AppBanner } from "metabase/common/components/AppBanner";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
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
import { EmbedSetupModals } from "metabase/embedding/embedding-iframe-sdk-setup/components/EmbedSetupModals";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { isQueryBuilderPagePath } from "metabase/nav/prototype/NavOpenButton";
import { NavVariantPicker } from "metabase/nav/prototype/NavVariantPicker";
import {
  PageMetabotButtonFallback,
  PageMetabotButtonProvider,
} from "metabase/nav/prototype/PageMetabotButton";
import { useSyncGitIntegrationAtStartup } from "metabase/nav/prototype/use-git-integration-enabled";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import type { AppErrorDescriptor } from "metabase/redux/store";
import { Outlet, useLocation } from "metabase/router";
import { getErrorPage, getIsNavbarOpen } from "metabase/selectors/app";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useGetSettingsQuery, useTokenRefresh } from "metabase/settings";
import { StatusListing } from "metabase/status/components/StatusListing";
import { Box, Flex } from "metabase/ui";
import { initializeIframeResizer } from "metabase/utils/dom";

import S from "./AppComponent.module.css";
import { AppKBarProvider } from "./AppKBarProvider";
import ScrollToTop from "./ScrollToTop";
import { trackPageView } from "./analytics";
import { Metabot } from "./metabot/components/Metabot";
import { NewModals } from "./new/components/NewModals/NewModals";
import { Palette } from "./palette/components/Palette";

const MonitorNavbar = lazy(() =>
  import(
    /* webpackChunkName: "monitor" */ "metabase/monitor/components/MonitorLayout"
  ).then(({ MonitorNavbar }) => ({ default: MonitorNavbar })),
);

const getErrorComponent = ({
  status,
  data,
  context,
  message,
}: AppErrorDescriptor) => {
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
  return <GenericError details={message} />;
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
  const isEmbeddingHubApp = useSelector((state) =>
    getIsEmbeddingHubApp(state, routerProps),
  );
  const isDataApp = useSelector((state) => getIsDataApp(state, routerProps));
  const isAppBarVisible = useSelector((state) =>
    getIsAppBarVisible(state, routerProps),
  );
  const isNavBarEnabled = useSelector((state) =>
    getIsNavBarEnabled(state, routerProps),
  );
  // PROTOTYPE: Usage analytics dashboards, questions and collections keep their
  // URLs but show inside Monitor: its nav instead of the main nav and app bar.
  const isUsageAnalyticsContent = useIsUsageAnalyticsContent();
  // PROTOTYPE: the "No top nav" variant moves the app bar into the main nav.
  // With the nav closed, a slim bar keeps the open button and breadcrumbs.
  const { variant: navVariant } = useNavVariant();
  // PROTOTYPE: keeps plugins' startup view of git integration current.
  useSyncGitIntegrationAtStartup();
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const isNoTopNav =
    navVariant === "no-top-nav" && isNavBarEnabled && !isAdminApp;
  // On query builder pages the header carries the open button instead, so
  // the nav-closed bar isn't needed there either.
  const showAppBar =
    isAppBarVisible &&
    !isUsageAnalyticsContent &&
    !(
      isNoTopNav &&
      (isNavbarOpen || isQueryBuilderPagePath(location.pathname))
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
          {/* PROTOTYPE: "No top nav" moves Chat with Metabot into page headers. */}
          <PageMetabotButtonProvider
            isEnabled={isNoTopNav && !isUsageAnalyticsContent}
          >
            <KeyboardTriggeredErrorModal />
            <Flex className={CS.spread} direction="column">
              <AppBanner />
              {showAppBar && <AppBarContainer isMinimal={isNoTopNav} />}
              <Flex
                className={cx(
                  CS.overflowHidden,
                  S.printFullHeight,
                  S.printOverflowVisible,
                )}
                flex="1 1 auto"
                direction={isAdminApp ? "column" : "row"}
                pos="relative"
                bg="background_page-primary"
              >
                {/* One slot for either nav, so the page beside it isn't remounted
                  when the choice changes. */}
                {isUsageAnalyticsContent ? (
                  <Suspense fallback={null}>
                    <MonitorNavbar />
                  </Suspense>
                ) : (
                  isNavBarEnabled && <Navbar />
                )}
                <Box
                  component="main"
                  ref={setViewportElement}
                  className={cx(CS.overflowAuto, S.printOverflowVisible)}
                  w="100%"
                  h="100%"
                  pos="relative"
                  style={{ scrollMarginTop: APP_BAR_HEIGHT }}
                >
                  <ContentViewportContext.Provider
                    value={viewportElement ?? null}
                  >
                    {errorPage ? getErrorComponent(errorPage) : <Outlet />}
                  </ContentViewportContext.Provider>
                  <PageMetabotButtonFallback />
                </Box>
                <UndoListing />
                <StatusListing />
                <NewModals />
                <EmbedSetupModals />
                <Metabot
                  hide={
                    isAdminApp ||
                    isDataStudioApp ||
                    isMonitorApp ||
                    isUsageAnalyticsContent ||
                    isEmbeddingHubApp ||
                    isDataApp
                  }
                />
              </Flex>
            </Flex>
            <Palette />
            {isNavBarEnabled && !isAdminApp && !isUsageAnalyticsContent && (
              <NavVariantPicker />
            )}
          </PageMetabotButtonProvider>
        </AppKBarProvider>
      </ScrollToTop>
    </ErrorBoundary>
  );
}
