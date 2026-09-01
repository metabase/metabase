import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isRouteInSync } from "metabase/common/hooks/is-route-in-sync";
import { useFavicon } from "metabase/common/hooks/use-favicon";
import CS from "metabase/css/core/index.css";
import {
  addCardToDashboard,
  navigateToNewCardFromDashboard,
  setEditingDashboard,
  toggleSidebar,
} from "metabase/dashboard/actions";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import {
  DASHBOARD_DISPLAY_ACTIONS,
  DASHBOARD_EDITING_ACTIONS,
  DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import { addDashboardQuestion } from "metabase/dashboard/components/QuestionPicker/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  DashboardContextProvider,
  useDashboardContext,
} from "metabase/dashboard/context";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks";
import { useAutoScrollToDashcard } from "metabase/dashboard/hooks/use-auto-scroll-to-dashcard";
import {
  usePageTitle,
  usePageTitleWithLoadingTime,
} from "metabase/hooks/use-page-title";
import { useDispatch, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import type { Location } from "metabase/router";
import { Outlet, useLocation, useNavigate, useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  parseHashOptions,
  parseSearchQuery,
  stringifyHashOptions,
} from "metabase/utils/browser";
import {
  ADHOC_DASHBOARD_HASH_KEY,
  getAdhocDashboardId,
  isAdhocDashboardPath,
} from "metabase/utils/dashboard";
import type { Dashboard as IDashboard } from "metabase-types/api";

import { useRegisterDashboardMetabotContext } from "../../hooks/use-register-dashboard-metabot-context";
import { getDocumentTitle, getFavicon } from "../../selectors";

import { useDashboardLocationSync } from "./use-dashboard-location-sync";
import { useSlowCardNotification } from "./use-slow-card-notification";

function DashboardAppInner({ location }: { location: Location }) {
  useDashboardLocationSync({ location });
  const pageFavicon = useSelector(getFavicon);
  useFavicon({ favicon: pageFavicon });
  useSlowCardNotification();
  const { dashboard, loadingStartTime, isRunning } = useDashboardContext();
  const documentTitle = useSelector(getDocumentTitle);

  usePageTitleWithLoadingTime(documentTitle || dashboard?.name || "", {
    titleIndex: 2,
    startTime: loadingStartTime,
    isRunning,
  });
  usePageTitle("Dashboard", { titleIndex: 1 });

  return (
    <>
      <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
        <DashboardLeaveConfirmationModal />
        <Dashboard />
        {/* For rendering modal urls */}
        <Outlet />
      </div>
    </>
  );
}

export const DASHBOARD_APP_ACTIONS = ({ isEditing }: { isEditing: boolean }) =>
  isEditing ? DASHBOARD_EDITING_ACTIONS : DASHBOARD_VIEW_ACTIONS;

const ADHOC_DASHBOARD_ACTIONS = () => DASHBOARD_DISPLAY_ACTIONS;

function getRouteDashboardId(location: Location, slug: string | undefined) {
  if (!isAdhocDashboardPath(location.pathname)) {
    return Urls.extractEntityId(slug);
  }
  const encodedDefinition = parseHashOptions(location.hash)[
    ADHOC_DASHBOARD_HASH_KEY
  ];
  return typeof encodedDefinition === "string"
    ? getAdhocDashboardId(encodedDefinition)
    : null;
}

export const DashboardApp = () => {
  const location = useLocation();
  const params = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [error, setError] = useState<string>();

  const parameterQueryParams = useMemo(
    () => parseSearchQuery(location.search),
    [location.search],
  );
  const dashboardId = getRouteDashboardId(location, params.slug);
  const isAdhocDashboard = isAdhocDashboardPath(location.pathname);

  useRegisterDashboardMetabotContext();
  useDashboardUrlQuery(location);

  const extractHashOption = async (
    key: string,
    options: ReturnType<typeof parseHashOptions>,
  ) => {
    const { [key]: removed, ...restHashOptions } = options;
    return restHashOptions;
  };

  const onLoadDashboard = async (dashboard: IDashboard) => {
    // an ad-hoc dashboard's hash IS its definition: no edit/add options to apply,
    // and rewriting the hash would drop the dashboard itself
    if (isAdhocDashboard) {
      return;
    }
    let options: ReturnType<typeof parseHashOptions> = parseHashOptions(
      window.location.hash,
    );
    const editingOnLoad = options.edit;
    const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

    try {
      if (editingOnLoad) {
        dispatch(setEditingDashboard(dashboard));
        options = await extractHashOption("edit", options);
      }

      if (addCardOnLoad != null && dashboardId != null) {
        options = await extractHashOption("add", options);
        const searchParams = new URLSearchParams(window.location.search);
        const tabParam = searchParams.get("tab");
        const tabId = tabParam ? parseInt(tabParam, 10) : null;

        dispatch(
          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId,
          }),
        );
      }
      const hashString = stringifyHashOptions(options);
      const hash = hashString ? "#" + hashString : "";
      if (hash !== location.hash) {
        await navigate(
          { ...location, hash },
          { replace: true, state: location.state },
        );
      }
    } catch (error) {
      // 400: provided entity id format is invalid.
      if (
        error instanceof Response &&
        (error.status === 400 || error.status === 404)
      ) {
        setErrorPage({ ...error, context: "dashboard" });
      } else {
        console.error(error);
        // Unjustified type cast. FIXME
        setError(error as string);
      }
    }
  };

  const { autoScrollToDashcardId, reportAutoScrolledToDashcard } =
    useAutoScrollToDashcard(location);

  // A slug that yields no id (e.g. /dashboard/not-a-number) would otherwise
  // leave the provider waiting for a fetch that never starts (metabase#78725)
  useEffect(() => {
    if (dashboardId == null) {
      dispatch(setErrorPage({ status: 404 }));
    }
  }, [dashboardId, dispatch]);

  // Prevent rendering the dashboard app if the route is out of sync
  // metabase#65500
  if (!isRouteInSync(location.pathname)) {
    return null;
  }

  if (dashboardId == null) {
    return null;
  }

  return (
    <ErrorBoundary message={error}>
      <DashboardContextProvider
        dashboardId={dashboardId}
        parameterQueryParams={parameterQueryParams}
        autoScrollToDashcardId={autoScrollToDashcardId}
        reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
        onLoadWithoutCards={onLoadDashboard}
        onError={(error) => dispatch(setErrorPage(error))}
        navigateToNewCardFromDashboard={(opts) =>
          dispatch(navigateToNewCardFromDashboard(opts))
        }
        onNewQuestion={() => dispatch(addDashboardQuestion("notebook"))}
        onAddQuestion={(dashboard: IDashboard | null) => {
          dispatch(setEditingDashboard(dashboard));
          dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion));
        }}
        dashboardActions={
          isAdhocDashboard ? ADHOC_DASHBOARD_ACTIONS : DASHBOARD_APP_ACTIONS
        }
      >
        <DashboardAppInner location={location} />
      </DashboardContextProvider>
    </ErrorBoundary>
  );
};
