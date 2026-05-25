import { useCallback, useMemo } from "react";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { useLocation } from "react-use";
import _ from "underscore";

import { useInitialCollectionId } from "metabase/collections/hooks";
import {
  getCommentSidebarOpen,
  getSidebarOpen,
} from "metabase/documents/selectors";
import { getMetabotVisible } from "metabase/metabot/state";
import AppBar from "metabase/nav/components/AppBar";
import type { AppBarProps } from "metabase/nav/components/AppBar/AppBar";
import QuestionLineage from "metabase/nav/components/QuestionLineage";
import CollectionBreadcrumbs from "metabase/nav/containers/CollectionBreadcrumbs";
import { zoomInRow } from "metabase/query_builder/actions";
import {
  getOriginalQuestion,
  getQuestion,
} from "metabase/query_builder/selectors";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { closeNavbar, toggleNavbar } from "metabase/redux/app";
import type { State } from "metabase/redux/store";
import type { RouterProps } from "metabase/selectors/app";
import {
  getDetailViewState,
  getIsAppSwitcherVisible,
  getIsCollectionPathVisible,
  getIsLogoVisible,
  getIsMetricsViewer,
  getIsNavBarEnabled,
  getIsNavbarOpen,
  getIsNewButtonVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
} from "metabase/selectors/app";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import { modelToUrl } from "metabase/urls";
import type { SearchResult } from "metabase-types/api";

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

type RouterLocation = { pathname?: string; state?: { cardId?: number } };

function AppBarContainer(props: AppBarProps & RouterProps) {
  const collectionId = useInitialCollectionId(props) ?? undefined;
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const originalQuestion = useSelector(getOriginalQuestion);
  const routerLocation = useLocation() as RouterLocation;

  const dashboard = useMemo(() => {
    const pathname = routerLocation.pathname;
    const isOnQuestionPage = !!pathname && /\/question\//.test(pathname);
    return isOnQuestionPage ? question?.dashboard() : undefined;
  }, [question, routerLocation.pathname]);

  const collectionBreadcrumbs = useMemo(
    () => <CollectionBreadcrumbs dashboard={dashboard} />,
    [dashboard],
  );

  const questionLineage = useMemo(
    () => (
      <QuestionLineage
        question={question}
        originalQuestion={originalQuestion}
      />
    ),
    [question, originalQuestion],
  );

  const onSearchItemSelect = useCallback(
    (result: SearchResult) => {
      // Skip the navigation when we're already viewing the model that owns
      // the indexed-entity row — just update the zoomed-in row in place.
      const isSameModel = result?.model_id === routerLocation.state?.cardId;
      if (isSameModel && result.model === "indexed-entity") {
        dispatch(zoomInRow({ objectId: result.id }));
      } else {
        const url = modelToUrl(result);
        if (url) {
          dispatch(push(url));
        }
      }
    },
    [dispatch, routerLocation.state?.cardId],
  );

  return (
    <AppBar
      {...props}
      collectionId={collectionId}
      collectionBreadcrumbs={collectionBreadcrumbs}
      questionLineage={questionLineage}
      onSearchItemSelect={onSearchItemSelect}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBarContainer);
