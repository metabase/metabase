import { connect } from "react-redux";
import { push } from "react-router-redux";
import { closeNavbar } from "metabase/redux/app";
import { State } from "metabase-types/store";
import NewItemMenu from "../../components/NewItemMenu";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "../../selectors";

const mapStateToProps = (state: State) => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
  onCloseNavbar: closeNavbar,
};

export default connect(mapStateToProps, mapDispatchToProps)(NewItemMenu);
