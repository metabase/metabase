import { connect } from "react-redux";
import { closeNavbar, getIsNavbarOpen, toggleNavbar } from "metabase/redux/app";
import {
  getCollectionId,
  getIsNewButtonVisible,
  getIsSearchVisible,
  RouterProps,
} from "metabase/selectors/app";
import { State } from "metabase-types/store";
import AppBar from "../../components/AppBar";

const mapStateToProps = (state: State, props: RouterProps) => ({
  isNavBarOpen: getIsNavbarOpen(state),
  isSearchVisible: getIsSearchVisible(state),
  isNewButtonVisible: getIsNewButtonVisible(state),
  collectionId: getCollectionId(state),
});

const mapDispatchToProps = {
  onToggleNavbar: toggleNavbar,
  onCloseNavbar: closeNavbar,
};

export default connect(mapStateToProps, mapDispatchToProps)(AppBar);
