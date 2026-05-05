import { withRouter } from "react-router";
import _ from "underscore";

import { useInitialCollectionId } from "metabase/collections/hooks";
import {
  getCommentSidebarOpen,
  getSidebarOpen,
} from "metabase/documents/selectors";
import { getMetabotVisible } from "metabase/metabot/state";
import { connect } from "metabase/redux";
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

import AppBar from "../../components/AppBar";
import type { AppBarProps } from "../../components/AppBar/AppBar";

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

function AppBarContainer(props: AppBarProps & RouterProps) {
  const collectionId = useInitialCollectionId(props) ?? undefined;
  return <AppBar {...props} collectionId={collectionId} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBarContainer);
