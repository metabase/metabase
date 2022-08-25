import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";
import { logout } from "metabase/auth/actions";
import { closeNavbar, getIsNavbarOpen, toggleNavbar } from "metabase/redux/app";
import {
  getCollectionId,
  getIsCollectionPathVisible,
  getIsNewButtonVisible,
  getIsProfileLinkVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
  RouterProps,
} from "metabase/selectors/app";
import { State } from "metabase-types/store";
import AppBar from "../../components/AppBar";
import { getUser } from "metabase/selectors/user";

const mapStateToProps = (state: State, props: RouterProps) => ({
  currentUser: getUser(state),
  collectionId: getCollectionId(state),
  isNavBarOpen: getIsNavbarOpen(state),
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

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBar);
