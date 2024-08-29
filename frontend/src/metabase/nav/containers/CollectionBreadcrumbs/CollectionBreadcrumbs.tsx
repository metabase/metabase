import { useLocation } from "react-use";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getQuestion } from "metabase/query_builder/selectors";
import { getCollectionId } from "metabase/selectors/app";
import type { CollectionId, DashboardId } from "metabase-types/api";

import {
  CollectionBreadcrumbs as InnerCollectionBreadcrumbs,
  type CollectionBreadcrumbsProps as InnerCollectionBreadcrumbsProps,
} from "../../components/CollectionBreadcrumbs/CollectionBreadcrumbs";

interface CollectionBreadcrumbsProps
  extends Omit<InnerCollectionBreadcrumbsProps, "collection" | "dashboard"> {
  dashboardId?: DashboardId | undefined;
  collectionId: CollectionId;
}

export const CollectionBreadcrumbs = (props: CollectionBreadcrumbsProps) => {
  const statefulCollectionId = useSelector(getCollectionId);
  const collectionId = props.collectionId ?? statefulCollectionId ?? "root";

  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  const statefulDashboardId = useSelector(getQuestion)?.dashboardId();
  const dashboardId = props.dashboardId ?? statefulDashboardId;
  const location = useLocation();
  const isQuestionPage = location.pathname?.startsWith("/question");
  const shouldShowDashboard = dashboardId && isQuestionPage;

  const dashboardReq = useGetDashboardQuery(
    shouldShowDashboard ? { id: dashboardId } : skipToken,
  );
  const dashboard = shouldShowDashboard ? dashboardReq?.data : undefined;

  return (
    <InnerCollectionBreadcrumbs
      {...props}
      collection={collection}
      dashboard={dashboard}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
