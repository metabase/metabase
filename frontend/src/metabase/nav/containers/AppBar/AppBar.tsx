import { connect } from "react-redux";
import { closeNavbar, getIsNavbarOpen, toggleNavbar } from "metabase/redux/app";
import {
  getCollectionId,
  getIsCollectionPathVisible,
  getIsNewButtonVisible,
  getIsSearchVisible,
  RouterProps,
} from "metabase/selectors/app";
import { State } from "metabase-types/store";
import AppBar from "../../components/AppBar";

const mapStateToProps = (state: State, props: RouterProps) => ({
  collectionId: getCollectionId(state),
  isNavBarOpen: getIsNavbarOpen(state),
  isSearchVisible: getIsSearchVisible(state),
  isNewButtonVisible: getIsNewButtonVisible(state),
  isCollectionPathVisible: getIsCollectionPathVisible(state, props),
});

const mapDispatchToProps = {
  onToggleNavbar: toggleNavbar,
  onCloseNavbar: closeNavbar,
};

export default connect(mapStateToProps, mapDispatchToProps)(AppBar);
