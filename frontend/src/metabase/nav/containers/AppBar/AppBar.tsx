import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";
import { closeNavbar, getIsNavbarOpen, toggleNavbar } from "metabase/redux/app";
import {
  getCollectionId,
  getIsCollectionPathVisible,
  getIsNewButtonVisible,
  getIsQuestionLineageVisible,
  getIsSearchVisible,
  RouterProps,
} from "metabase/selectors/app";
import { State } from "metabase-types/store";
import AppBar from "../../components/AppBar/AppBarDesktop";

const mapStateToProps = (state: State, props: RouterProps) => ({
  collectionId: getCollectionId(state),
  isNavBarOpen: getIsNavbarOpen(state),
  isSearchVisible: getIsSearchVisible(state),
  isNewButtonVisible: getIsNewButtonVisible(state),
  isCollectionPathVisible: getIsCollectionPathVisible(state, props),
  isQuestionLineageVisible: getIsQuestionLineageVisible(state),
});

const mapDispatchToProps = {
  onToggleNavbar: toggleNavbar,
  onCloseNavbar: closeNavbar,
};

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(AppBar);
