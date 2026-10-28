import { skipToken, useGetDashboardQuery } from "metabase/api";
import { QuestionLineage } from "metabase/app/nav/QuestionLineage";
import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { CollectionBreadcrumbs } from "metabase/nav/containers/CollectionBreadcrumbs";
import { isQuestionPath } from "metabase/nav/containers/MainNavbar/getSelectedItems";
import { getOriginalQuestion, getQuestion } from "metabase/query_builder";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";
import { getDetailViewState } from "metabase/selectors/app";

import {
  getCollectionId,
  getIsCollectionPathVisible,
  getIsQuestionLineageVisible,
} from "./selectors";

/**
 * Breadcrumbs for the current route: the object-detail path, the "started
 * from" lineage of a modified saved question, or the collection path.
 * Renders nothing on routes without one.
 */
export function AppBreadcrumbs() {
  // These selectors derive visibility from the URL, so they take the router
  // props rather than reading them from the store.
  const location = useLocation();
  const routerProps = { location };

  const isCollectionPathVisible = useSelector((state) =>
    getIsCollectionPathVisible(state, routerProps),
  );
  const isQuestionLineageVisible = useSelector((state) =>
    getIsQuestionLineageVisible(state, routerProps),
  );
  const detailView = useSelector(getDetailViewState);
  const question = useSelector(getQuestion);
  const originalQuestion = useSelector(getOriginalQuestion);
  const collectionId = useSelector(getCollectionId);

  const isOnQuestionPage = isQuestionPath(location.pathname);
  const dashboardId = isOnQuestionPage ? question?.dashboard()?.id : undefined;
  const { data: dashboard } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  if (detailView) {
    return (
      <DetailViewNav rowName={detailView.rowName} table={detailView.table} />
    );
  }

  if (isQuestionLineageVisible) {
    return (
      <QuestionLineage
        question={question}
        originalQuestion={originalQuestion}
      />
    );
  }

  if (isCollectionPathVisible) {
    return (
      <CollectionBreadcrumbs
        dashboard={dashboardId != null ? dashboard : undefined}
        collectionId={collectionId ?? undefined}
      />
    );
  }

  return null;
}
