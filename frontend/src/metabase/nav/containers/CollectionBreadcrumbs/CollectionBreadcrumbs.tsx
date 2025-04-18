import { useLocation } from "react-use";

import { useGetCollectionQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import {
  getCollectionId,
  getIsQuestionLineageVisible,
} from "metabase/selectors/app";
import type { CollectionId } from "metabase-types/api";

import {
  CollectionBreadcrumbs as Breadcrumbs,
  type CollectionBreadcrumbsProps as BreadcrumbsProps,
} from "../../components/CollectionBreadcrumbs/CollectionBreadcrumbs";

type CollectionBreadcrumbsProps = Omit<
  BreadcrumbsProps,
  | "collection"
  | "dashboard"
  | "baseCollectionId"
  | "originalQuestion"
  | "originalDashboard"
> & {
  collectionId?: CollectionId;
  baseCollectionId?: CollectionId | null;
};

export const CollectionBreadcrumbs = (props: CollectionBreadcrumbsProps) => {
  const statefulCollectionId = useSelector(getCollectionId);
  const collectionId = props.collectionId ?? statefulCollectionId ?? "root";
  const isQuestionLineageVisible = useSelector(getIsQuestionLineageVisible);
  const originalQuestion = useSelector(getOriginalQuestion);

  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  const question = useSelector(getQuestion);
  const { pathname } = useLocation();
  const isOnQuestionPage = pathname && /\/question\//.test(pathname);
  const dashboard = isOnQuestionPage ? question?.dashboard() : undefined;

  // If we're showing a modified question, use the original question's collection and dashboard
  const effectiveCollection =
    isQuestionLineageVisible && originalQuestion
      ? originalQuestion.collection()
      : collection;

  const originalDashboard =
    isQuestionLineageVisible && originalQuestion
      ? originalQuestion.dashboard()
      : undefined;

  return (
    <Breadcrumbs
      {...props}
      collection={effectiveCollection}
      dashboard={dashboard}
      originalDashboard={originalDashboard}
      baseCollectionId={props.baseCollectionId ?? null}
      isModifiedQuestion={isQuestionLineageVisible}
      originalQuestion={originalQuestion}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
