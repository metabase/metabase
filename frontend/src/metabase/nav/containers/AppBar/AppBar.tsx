import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import { logout } from "metabase/auth/actions";
import { closeNavbar, getIsNavbarOpen, toggleNavbar } from "metabase/redux/app";
import {
  getIsCollectionPathVisible,
  getIsLogoVisible,
  getIsNavBarEnabled,
  getIsNewButtonVisible,
  getIsProfileLinkVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
  RouterProps,
} from "metabase/selectors/app";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import AppBar from "../../components/AppBar";

const mapStateToProps = (state: State, props: RouterProps) => ({
  currentUser: getUser(state),
  collectionId: Collections.selectors.getInitialCollectionId(state, props),
  isNavBarOpen: getIsNavbarOpen(state),
  isNavBarEnabled: getIsNavBarEnabled(state, props),
  isLogoVisible: getIsLogoVisible(state),
  isSearchVisible: getIsSearchVisible(state),
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
