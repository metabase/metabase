import { withRouter } from "react-router";
import { push } from "react-router-redux";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import {
  getCollectionId,
  getIsAppSwitcherVisible,
  getIsCollectionPathVisible,
  getIsLogoVisible,
  getIsMetricsViewer,
  getIsNavBarEnabled,
  getIsNewButtonVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
} from "metabase/app/selectors";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import {
  getCommentSidebarOpen,
  getSidebarOpen,
} from "metabase/documents/selectors";
import { getMetabotVisible } from "metabase/metabot/state";
import { AppBar as AppBarView } from "metabase/nav/components/AppBar";
import type { AppBarProps } from "metabase/nav/components/AppBar/AppBar";
import { QuestionLineage } from "metabase/nav/components/QuestionLineage";
import { CollectionBreadcrumbs } from "metabase/nav/containers/CollectionBreadcrumbs";
import { isQuestionPath } from "metabase/nav/containers/MainNavbar/getSelectedItems";
import { zoomInRow } from "metabase/query_builder/actions";
import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { closeNavbar, toggleNavbar } from "metabase/redux/app";
import type { State } from "metabase/redux/store";
import type { RouterProps } from "metabase/selectors/app";
import { getDetailViewState, getIsNavbarOpen } from "metabase/selectors/app";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import { modelToUrl } from "metabase/urls";
import type { SearchResult } from "metabase-types/api";

type SearchResultSelection =
  | { type: "zoom"; objectId: SearchResult["id"] }
  | { type: "navigate"; url: string };

/**
 * Decides what should happen when a search result is selected from the app bar.
 * When the result is an indexed-entity row that belongs to the model we're
 * already viewing, we zoom into that row in place instead of navigating away.
 */
export function getSearchResultSelection(
  result: SearchResult,
  currentCardId: number | undefined,
): SearchResultSelection {
  if (result.model === "indexed-entity" && result.model_id === currentCardId) {
    return { type: "zoom", objectId: result.id };
  }
  return { type: "navigate", url: modelToUrl(result) };
}

const mapStateToProps = (state: State, props: RouterProps) => ({
  currentUser: getUser(state),
  isNavBarOpen: getIsNavbarOpen(state),
  isNavBarEnabled: getIsNavBarEnabled(state, props),
  isMetabotVisible: getMetabotVisible(state, "omnibot"),
  isDocumentSidebarOpen: getSidebarOpen(state),
  isCommentSidebarOpen: getCommentSidebarOpen(state),
  isLogoVisible: getIsLogoVisible(state),
  isSearchVisible: getIsSearchVisible(state),
  isEmbeddingIframe: getIsEmbeddingIframe(state),
  isNewButtonVisible: getIsNewButtonVisible(state),
  isAppSwitcherVisible: getIsAppSwitcherVisible(state),
  isCollectionPathVisible: getIsCollectionPathVisible(state, props),
  isQuestionLineageVisible: getIsQuestionLineageVisible(state, props),
  detailView: getDetailViewState(state),
  isMetricsViewer: getIsMetricsViewer(state, props),
});

const mapDispatchToProps = {
  onToggleNavbar: toggleNavbar,
  onCloseNavbar: closeNavbar,
};

function AppBarContainerInner(props: AppBarProps & RouterProps) {
  const collectionId = useInitialCollectionId(props) ?? undefined;
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const originalQuestion = useSelector(getOriginalQuestion);
  // The breadcrumbs' current collection is derived from the active
  // dashboard/question/document state. CollectionBreadcrumbs used to read this
  // itself, but getCollectionId orchestrates feature state and now lives in the
  // app tier, so the app-tier AppBar resolves it and passes it down.
  const breadcrumbCollectionId = useSelector(getCollectionId);

  const { pathname } = props.location;
  const isOnQuestionPage = pathname && isQuestionPath(pathname);
  const dashboardId = isOnQuestionPage ? question?.dashboard()?.id : undefined;
  const { data: dashboard } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  const locationState = props.location.state as { cardId?: number } | undefined;

  const onSearchItemSelect = (result: SearchResult) => {
    const selection = getSearchResultSelection(result, locationState?.cardId);
    if (selection.type === "zoom") {
      dispatch(zoomInRow({ objectId: selection.objectId }));
    } else {
      dispatch(push(selection.url));
    }
  };

  return (
    <AppBarView
      {...props}
      collectionId={collectionId}
      collectionBreadcrumbs={
        <CollectionBreadcrumbs
          dashboard={dashboardId != null ? dashboard : undefined}
          collectionId={breadcrumbCollectionId ?? undefined}
        />
      }
      questionLineage={
        <QuestionLineage
          question={question}
          originalQuestion={originalQuestion}
        />
      }
      onSearchItemSelect={onSearchItemSelect}
    />
  );
}

export const AppBarContainer = withRouter(
  connect(mapStateToProps, mapDispatchToProps)(AppBarContainerInner),
);
