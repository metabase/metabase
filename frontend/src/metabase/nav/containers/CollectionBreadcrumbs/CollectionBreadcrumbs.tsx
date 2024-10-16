import { useLocation } from "react-use";
import _ from "underscore";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { getViewedItem } from "metabase/selectors/app";
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

// TODO: not sure how these changes will work for the embedding folks
export const CollectionBreadcrumbs = (props: CollectionBreadcrumbsProps) => {
  const viewedItem = useSelector(getViewedItem);

  const { data: viewedQuestion } = useGetCardQuery(
    viewedItem.model === "question" && viewedItem.question?.id
      ? { id: viewedItem.question.id() }
      : skipToken,
  );

  const { data: viewedDashboard } = useGetDashboardQuery(
    viewedItem.model === "dashboard" && viewedItem.dashboard?.id
      ? { id: viewedItem.dashboard.id }
      : skipToken,
  );

  const viewedItemParentCollectionId =
    viewedDashboard?.collection_id ?? viewedQuestion?.collection_id;
  const collectionId =
    props.collectionId ?? viewedItemParentCollectionId ?? ROOT_COLLECTION.id;
  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  const dashboardId = viewedQuestion?.dashboard_id;
  const isDashboardQuestion = _.isNumber(dashboardId);
  const isQuestionPage = useLocation().pathname?.startsWith("/question");
  const shouldShowDashboard = isDashboardQuestion && isQuestionPage;

  const { data: viewedDashboardQuestionDashboard } = useGetDashboardQuery(
    shouldShowDashboard ? { id: dashboardId } : skipToken,
  );

  return (
    <Breadcrumbs
      {...props}
      collection={collection}
      dashboard={viewedDashboardQuestionDashboard}
      baseCollectionId={props.baseCollectionId ?? null}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
