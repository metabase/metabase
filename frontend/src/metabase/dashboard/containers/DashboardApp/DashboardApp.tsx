import cx from "classnames";
import type { PropsWithChildren } from "react";
import { useState } from "react";
import type { Route, WithRouterProps } from "react-router";
import { push } from "react-router-redux";

import ErrorBoundary from "metabase/ErrorBoundary";
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
  DASHBOARD_EDITING_ACTIONS,
  DASHBOARD_VIEW_ACTIONS,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { DashboardContextProvider } from "metabase/dashboard/context";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks";
import { useAutoScrollToDashcard } from "metabase/dashboard/hooks/use-auto-scroll-to-dashcard";
import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import type { DashboardId, Dashboard as IDashboard } from "metabase-types/api";

import { useRegisterDashboardMetabotContext } from "../../hooks/use-register-dashboard-metabot-context";
import { getFavicon } from "../../selectors";

import { DashboardTitle } from "./DashboardTitle";
import { useDashboardLocationSync } from "./use-dashboard-location-sync";
import { useSlowCardNotification } from "./use-slow-card-notification";

interface DashboardAppProps
  extends PropsWithChildren<WithRouterProps<{ slug: string }>> {
  dashboardId?: DashboardId;
  route: Route;
}

type DashboardAppInnerProps = Pick<
  DashboardAppProps,
  "location" | "route" | "children"
>;

function DashboardAppInner({
  location,
  route,
  children,
}: DashboardAppInnerProps) {
  useDashboardLocationSync({ location });
  const pageFavicon = useSelector(getFavicon);
  useFavicon({ favicon: pageFavicon });
  useSlowCardNotification();

  return (
    <>
      <DashboardTitle />
      <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
        <DashboardLeaveConfirmationModal route={route} />
        <Dashboard />
        {/* For rendering modal urls */}
        {children}
      </div>
    </>
  );
}

export const DASHBOARD_APP_ACTIONS = ({ isEditing }: { isEditing: boolean }) =>
  isEditing ? DASHBOARD_EDITING_ACTIONS : DASHBOARD_VIEW_ACTIONS;

export const DashboardApp = ({
  location,
  params,
  router,
  route,
  dashboardId: _dashboardId,
  children,
}: DashboardAppProps) => {
  const dispatch = useDispatch();

  const [error, setError] = useState<string>();

  const parameterQueryParams = location.query;
  const dashboardId =
    _dashboardId || (Urls.extractEntityId(params.slug) as DashboardId);

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

  useRegisterDashboardMetabotContext();
  useDashboardUrlQuery(router, location);

  const extractAndRemoveHashOption = (key: string) => {
    const { [key]: removed, ...restHashOptions } = options;
    const hash = stringifyHashOptions(restHashOptions);
    dispatch(push({ ...location, hash: hash ? "#" + hash : "" }));
  };

  const onLoadDashboard = (dashboard: IDashboard) => {
    try {
      if (editingOnLoad) {
        dispatch(setEditingDashboard(dashboard));
        extractAndRemoveHashOption("edit");
      }
      if (addCardOnLoad != null) {
        extractAndRemoveHashOption("add");
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
    } catch (error) {
      if (error instanceof Response && error.status === 404) {
        setErrorPage({ ...error, context: "dashboard" });
      } else {
        console.error(error);
        setError(error as string);
      }
    }
  };

  const { autoScrollToDashcardId, reportAutoScrolledToDashcard } =
    useAutoScrollToDashcard(location);

  return (
    <ErrorBoundary message={error}>
      <DashboardContextProvider
        dashboardId={dashboardId}
        parameterQueryParams={parameterQueryParams}
        autoScrollToDashcardId={autoScrollToDashcardId}
        reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
        onLoad={onLoadDashboard}
        onError={(error) => dispatch(setErrorPage(error))}
        navigateToNewCardFromDashboard={(opts) =>
          dispatch(navigateToNewCardFromDashboard(opts))
        }
        onAddQuestion={(dashboard: IDashboard | null) => {
          dispatch(setEditingDashboard(dashboard));
          dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion));
        }}
        dashboardActions={DASHBOARD_APP_ACTIONS}
      >
        <DashboardAppInner location={location} route={route}>
          {children}
        </DashboardAppInner>
      </DashboardContextProvider>
    </ErrorBoundary>
  );
};
