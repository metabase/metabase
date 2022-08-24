import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import _ from "underscore";
import Collections from "metabase/entities/collections";
import { closeNavbar } from "metabase/redux/app";
import NewItemMenu from "metabase/components/NewItemMenu";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/nav/selectors";
import { State } from "metabase-types/store";

const mapStateToProps = (state: State, props: unknown) => ({
  collectionId: Collections.selectors.getInitialCollectionId(state, props),
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
  onCloseNavbar: closeNavbar,
};

export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(NewItemMenu);
