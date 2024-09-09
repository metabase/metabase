import { useLocation } from "react-use";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getQuestion } from "metabase/query_builder/selectors";
import { getCollectionId } from "metabase/selectors/app";
import type { CollectionId } from "metabase-types/api";

import {
  CollectionBreadcrumbs as Breadcrumbs,
  type CollectionBreadcrumbsProps as BreadcrumbsProps,
} from "../../components/CollectionBreadcrumbs/CollectionBreadcrumbs";

interface CollectionBreadcrumbsProps
  extends Omit<
    BreadcrumbsProps,
    "collection" | "dashboard" | "baseCollectionId"
  > {
  collectionId?: CollectionId;
  baseCollectionId?: CollectionId | null;
}

export const CollectionBreadcrumbs = (props: CollectionBreadcrumbsProps) => {
  const statefulCollectionId = useSelector(getCollectionId);
  const collectionId = props.collectionId ?? statefulCollectionId ?? "root";

  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  const dashboardId = useSelector(getQuestion)?.dashboardId();
  const isDashboardQuestion = typeof dashboardId === "number";
  const isQuestionPage = useLocation().pathname?.startsWith("/question");
  const shouldShowDashboard = isDashboardQuestion && isQuestionPage;

  const dashboardReq = useGetDashboardQuery(
    shouldShowDashboard ? { id: dashboardId } : skipToken,
  );
  const dashboard = shouldShowDashboard ? dashboardReq?.data : undefined;

  return (
    <Breadcrumbs
      {...props}
      collection={collection}
      dashboard={dashboard}
      baseCollectionId={props.baseCollectionId ?? null}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
