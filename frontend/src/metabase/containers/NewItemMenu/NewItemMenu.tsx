import { ReactNode } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { closeNavbar } from "metabase/redux/app";
import NewItemMenu from "metabase/components/NewItemMenu";
import {
  getHasDataAccess,
  getHasDatabaseWithJsonEngine,
  getHasNativeWrite,
} from "metabase/nav/selectors";
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
  onChangeLocation: (location: string) => void;
  onCloseNavbar: () => void;
}

const mapStateToProps = (state: State): MenuStateProps => ({
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
  hasDatabaseWithJsonEngine: getHasDatabaseWithJsonEngine(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
  onCloseNavbar: closeNavbar,
};

export default connect<MenuStateProps, MenuDispatchProps, MenuOwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(NewItemMenu);
