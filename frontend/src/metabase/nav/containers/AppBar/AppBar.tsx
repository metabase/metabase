import type { Location } from "history";

import {
  getCommentSidebarOpen,
  getSidebarOpen,
} from "metabase/documents/selectors";
import { Collections } from "metabase/entities/collections";
import { connect, useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
import { closeNavbar, toggleNavbar } from "metabase/redux/app";
import { useCompatLocation, useCompatParams } from "metabase/routing/compat";
import type { RouterProps } from "metabase/selectors/app";
import {
  getDetailViewState,
  getIsCollectionPathVisible,
  getIsLogoVisible,
  getIsNavBarEnabled,
  getIsNavbarOpen,
  getIsNewButtonVisible,
  getIsProfileLinkVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
} from "metabase/selectors/app";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import AppBarComponent from "../../components/AppBar";

/**
 * Wrapper component that provides routing context via hooks.
 * This replaces the withRouter HOC pattern.
 */
function AppBarContainer() {
  const compatLocation = useCompatLocation();
  const params = useCompatParams();

  // Cast to v3 Location type for selector compatibility
  const location = compatLocation as unknown as Location;

  // Create props object that matches RouterProps for selectors
  const routerProps: RouterProps = { location };

  // Use selectors with router props
  const currentUser = useSelector(getUser);
  const collectionId = useSelector((state: State) =>
    Collections.selectors.getInitialCollectionId(state, routerProps),
  );
  const isNavBarOpen = useSelector(getIsNavbarOpen);
  const isNavBarEnabled = useSelector((state: State) =>
    getIsNavBarEnabled(state, routerProps),
  );
  const isMetabotVisible = useSelector((state: State) =>
    PLUGIN_METABOT.getMetabotVisible(state, "omnibot"),
  );
  const isDocumentSidebarOpen = useSelector(getSidebarOpen);
  const isCommentSidebarOpen = useSelector(getCommentSidebarOpen);
  const isLogoVisible = useSelector(getIsLogoVisible);
  const isSearchVisible = useSelector(getIsSearchVisible);
  const isEmbeddingIframe = useSelector(getIsEmbeddingIframe);
  const isNewButtonVisible = useSelector(getIsNewButtonVisible);
  const isProfileLinkVisible = useSelector(getIsProfileLinkVisible);
  const isCollectionPathVisible = useSelector((state: State) =>
    getIsCollectionPathVisible(state, routerProps),
  );
  const isQuestionLineageVisible = useSelector((state: State) =>
    getIsQuestionLineageVisible(state, routerProps),
  );
  const detailView = useSelector(getDetailViewState);

  if (!currentUser) {
    return null;
  }

  return (
    <ConnectedAppBar
      currentUser={currentUser}
      collectionId={collectionId}
      isNavBarOpen={isNavBarOpen}
      isNavBarEnabled={isNavBarEnabled}
      isMetabotVisible={isMetabotVisible}
      isDocumentSidebarOpen={isDocumentSidebarOpen}
      isCommentSidebarOpen={isCommentSidebarOpen}
      isLogoVisible={isLogoVisible}
      isSearchVisible={isSearchVisible}
      isEmbeddingIframe={isEmbeddingIframe}
      isNewButtonVisible={isNewButtonVisible}
      isProfileLinkVisible={isProfileLinkVisible}
      isCollectionPathVisible={isCollectionPathVisible}
      isQuestionLineageVisible={isQuestionLineageVisible}
      detailView={detailView}
    />
  );
}

const mapDispatchToProps = {
  onToggleNavbar: toggleNavbar,
  onCloseNavbar: closeNavbar,
};

const ConnectedAppBar = connect(null, mapDispatchToProps)(AppBarComponent);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarContainer;
