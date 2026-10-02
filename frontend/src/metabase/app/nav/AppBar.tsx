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
} from "metabase/app/nav/selectors";
import { useInitialCollectionId } from "metabase/common/collections/hooks";
import { getUser } from "metabase/current-user";
import { getIsSidebarOpen } from "metabase/documents/selectors";
import { getMetabotVisible } from "metabase/metabot/state";
import { AppBar as AppBarView } from "metabase/nav/components/AppBar";
import { CollectionBreadcrumbs } from "metabase/nav/containers/CollectionBreadcrumbs";
import { isQuestionPath } from "metabase/nav/containers/MainNavbar/getSelectedItems";
import { getOriginalQuestion, getQuestion } from "metabase/query_builder";
import { useDispatch, useSelector } from "metabase/redux";
import { closeNavbar, toggleNavbar } from "metabase/redux/app";
import { useLocation, useNavigate, useParams } from "metabase/router";
import { getDetailViewState, getIsNavbarOpen } from "metabase/selectors/app";
import { modelToUrl } from "metabase/urls";
import { isWithinIframe } from "metabase/utils/iframe";
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
  const navigate = useNavigate();

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
  const isDocumentSidebarOpen = useSelector(getIsSidebarOpen);
  const isLogoVisible = useSelector(getIsLogoVisible);
  const isSearchVisible = useSelector(getIsSearchVisible);
  const isEmbeddingIframe = isWithinIframe();
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

  const onSearchItemSelect = async (result: SearchResult) => {
    const selection = getSearchResultSelection(result, locationState?.cardId);
    if (selection.type === "zoom") {
      // Reached through an import so the app bar, which every page mounts, does
      // not put the query builder's actions in the initial bundle. Only a search
      // selection on an object-detail page gets here, and the query builder it
      // zooms within is already loaded by then.
      const { zoomInRow } = await import("metabase/query_builder");
      dispatch(zoomInRow({ objectId: selection.objectId }));
    } else {
      navigate(selection.url);
    }
  };

  return (
    <AppBarView
      currentUser={currentUser}
      isNavBarOpen={isNavBarOpen}
      isNavBarEnabled={isNavBarEnabled}
      isMetabotVisible={isMetabotVisible}
      isDocumentSidebarOpen={isDocumentSidebarOpen}
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
