import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import { logout } from "metabase/auth/actions";
import Collections from "metabase/entities/collections";
import { closeNavbar, toggleNavbar } from "metabase/redux/app";
import type { RouterProps } from "metabase/selectors/app";
import {
  getIsNavbarOpen,
  getIsCollectionPathVisible,
  getIsLogoVisible,
  getIsNavBarEnabled,
  getIsNewButtonVisible,
  getIsProfileLinkVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
} from "metabase/selectors/app";
import { getIsEmbedded } from "metabase/selectors/embed";
import { getUser } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

import AppBar from "../../components/AppBar";

const mapStateToProps = (state: State, props: RouterProps) => ({
  currentUser: getUser(state),
  collectionId: Collections.selectors.getInitialCollectionId(state, props),
  isNavBarOpen: getIsNavbarOpen(state),
  isNavBarEnabled: getIsNavBarEnabled(state, props),
  isLogoVisible: getIsLogoVisible(state),
  isSearchVisible: getIsSearchVisible(state),
  isEmbedded: getIsEmbedded(state),
  isNewButtonVisible: getIsNewButtonVisible(state),
  isProfileLinkVisible: getIsProfileLinkVisible(state),
  isCollectionPathVisible: getIsCollectionPathVisible(state, props),
  isQuestionLineageVisible: getIsQuestionLineageVisible(state, props),
});

const mapDispatchToProps = {
  onToggleNavbar: toggleNavbar,
  onCloseNavbar: closeNavbar,
  onLogout: logout,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBar);
