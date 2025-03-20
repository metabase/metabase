import cx from "classnames";
import type { PropsWithChildren, ReactNode } from "react";
import type { Route, WithRouterProps } from "react-router";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import { DashboardLeaveConfirmationModal } from "metabase/dashboard/components/DashboardLeaveConfirmationModal";
import { useDashboardUrlQuery } from "metabase/dashboard/hooks";
import { getIsDirty, getIsEditing } from "metabase/dashboard/selectors";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useFavicon } from "metabase/hooks/use-favicon";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { DashboardId } from "metabase-types/api";

import { DashboardContextProvider, useDashboardContext } from "../../context";
type OwnProps = {
  dashboardId?: DashboardId;
  route: Route;
  params: { slug: string };
  children?: ReactNode;
};

export type DashboardAppProps = OwnProps & WithRouterProps;

function getDashboardId({ dashboardId, params }: DashboardAppProps) {
  if (dashboardId) {
    return dashboardId;
  }

  return Urls.extractEntityId(params.slug) as DashboardId;
}

const DashboardApp = (props: DashboardAppProps) => {
  useDashboardUrlQuery(props.router, props.location);

  const { route, location } = props;

  const parameterQueryParams = location.query;
  const dashboardId = getDashboardId(props);
  const isEditing = useSelector(getIsEditing);
  const isDirty = useSelector(getIsDirty);
  return (
    <div className={cx(CS.shrinkBelowContentSize, CS.fullHeight)}>
      <DashboardLeaveConfirmationModal
        route={route}
        isDirty={isDirty}
        isEditing={isEditing}
      />
      <DashboardContextProvider
        dashboardId={dashboardId}
        location={location}
        parameterQueryParams={parameterQueryParams}
      >
        <DashboardTitle>
          <Dashboard />
        </DashboardTitle>
      </DashboardContextProvider>
      {props.children}
    </div>
  );
};

export const DashboardAppConnected = DashboardApp;

const EnhancedDashboardTitle = _.compose(
  title(props => ({
    title: props.documentTitle || props.dashboard?.name,
    titleIndex: 1,
  })),
  titleWithLoadingTime("loadingStartTime"),
)(({ children }: PropsWithChildren) => children);

const DashboardTitle = ({ children }: PropsWithChildren) => {
  const { dashboard, documentTitle, pageFavicon } = useDashboardContext();
  useFavicon({ favicon: pageFavicon });

  return (
    <EnhancedDashboardTitle documentTitle={documentTitle} dashboard={dashboard}>
      {children}
    </EnhancedDashboardTitle>
  );
};
