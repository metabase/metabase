import { ReactNode } from "react";
import { connect } from "react-redux";
import { closeNavbar } from "metabase/redux/app";
import NewItemMenu from "metabase/components/NewItemMenu";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/selectors/data";
import { State } from "metabase-types/store";

interface MenuOwnProps {
  className?: string;
  trigger?: ReactNode;
  triggerIcon?: string;
  triggerTooltip?: string;
  analyticsContext?: string;
}

interface MenuStateProps {
  hasDataAccess: boolean;
  hasNativeWrite: boolean;
  hasDatabaseWithJsonEngine: boolean;
}

interface MenuDispatchProps {
  onCloseNavbar: () => void;
}

const mapStateToProps = (state: State): MenuStateProps => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(state),
});

const mapDispatchToProps = {
  onCloseNavbar: closeNavbar,
};

export default connect<MenuStateProps, MenuDispatchProps, MenuOwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(NewItemMenu);
