import { skipToken, useGetDashboardQuery } from "metabase/api";
import { QuestionLineage } from "metabase/app/nav/QuestionLineage";
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
import { CollectionBreadcrumbs } from "metabase/nav/containers/CollectionBreadcrumbs";
import { isQuestionPath } from "metabase/nav/containers/MainNavbar/getSelectedItems";
import { zoomInRow } from "metabase/query_builder/actions";
import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { closeNavbar, toggleNavbar } from "metabase/redux/app";
import { push, useLocation, useParams } from "metabase/router";
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

export function AppBarContainer() {
  const dispatch = useDispatch();

  // These selectors derive app-bar visibility from the URL, so they take the
  // router props rather than reading them from the store.
  const location = useLocation();
  const params = useParams();
  const routerProps = { location };
  const collectionId =
    useInitialCollectionId({ location, params }) ?? undefined;

  const currentUser = useSelector(getUser);
  const isNavBarOpen = useSelector(getIsNavbarOpen);
  const isNavBarEnabled = useSelector((state) =>
    getIsNavBarEnabled(state, routerProps),
  );
  const isMetabotVisible = useSelector((state) =>
    getMetabotVisible(state, "omnibot"),
  );
  const isDocumentSidebarOpen = useSelector(getSidebarOpen);
  const isCommentSidebarOpen = useSelector(getCommentSidebarOpen);
  const isLogoVisible = useSelector(getIsLogoVisible);
  const isSearchVisible = useSelector(getIsSearchVisible);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);
  const isNewButtonVisible = useSelector(getIsNewButtonVisible);
  const isAppSwitcherVisible = useSelector(getIsAppSwitcherVisible);
  const isCollectionPathVisible = useSelector((state) =>
    getIsCollectionPathVisible(state, routerProps),
  );
  const isQuestionLineageVisible = useSelector((state) =>
    getIsQuestionLineageVisible(state, routerProps),
  );
  const detailView = useSelector(getDetailViewState);
  const isMetricsViewer = useSelector((state) =>
    getIsMetricsViewer(state, routerProps),
  );

  const question = useSelector(getQuestion);
  const originalQuestion = useSelector(getOriginalQuestion);
  // The breadcrumbs' current collection is derived from the active
  // dashboard/question/document state. CollectionBreadcrumbs used to read this
  // itself, but getCollectionId orchestrates feature state and now lives in the
  // app tier, so the app-tier AppBar resolves it and passes it down.
  const breadcrumbCollectionId = useSelector(getCollectionId);

  const { pathname } = location;
  const isOnQuestionPage = pathname && isQuestionPath(pathname);
  const dashboardId = isOnQuestionPage ? question?.dashboard()?.id : undefined;
  const { data: dashboard } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  // Unjustified type cast. FIXME
  const locationState = location.state as { cardId?: number } | undefined;

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
      currentUser={currentUser}
      isNavBarOpen={isNavBarOpen}
      isNavBarEnabled={isNavBarEnabled}
      isMetabotVisible={isMetabotVisible}
      isDocumentSidebarOpen={isDocumentSidebarOpen}
      isCommentSidebarOpen={isCommentSidebarOpen}
      isLogoVisible={isLogoVisible}
      isSearchVisible={isSearchVisible}
      isEmbeddingIframe={isEmbeddingIframe}
      isNewButtonVisible={isNewButtonVisible}
      isAppSwitcherVisible={isAppSwitcherVisible}
      isCollectionPathVisible={isCollectionPathVisible}
      isQuestionLineageVisible={isQuestionLineageVisible}
      detailView={detailView}
      isMetricsViewer={isMetricsViewer}
      onToggleNavbar={() => dispatch(toggleNavbar())}
      onCloseNavbar={() => dispatch(closeNavbar())}
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
