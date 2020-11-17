import React, { Component } from "react";
import PropTypes from "prop-types";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { clearSaveError, initialize } from "../permissions";
import { getIsDirty, getSaveError } from "../selectors";
import { t } from "ttag";
import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";

const mapStateToProps = (state, props) => ({
  isDirty: getIsDirty(state, props),
  saveError: getSaveError(state, props),
});

const mapDispatchToProps = {
  clearSaveError,
  initialize,
  push,
};

@withRouter
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
export default class PermissionsApp extends Component {
  static propTypes = {
    load: PropTypes.func.isRequired,
    save: PropTypes.func.isRequired,
  };

  constructor(props, context) {
    super(props, context);
    this.state = {
      nextLocation: false,
      confirmed: false,
    };
  }
  componentWillMount() {
    this.props.initialize(this.props.load, this.props.save);
    this.props.router.setRouteLeaveHook(this.props.route, this.routerWillLeave);
  }
  routerWillLeave = nextLocation => {
    if (this.props.isDirty && !this.state.confirmed) {
      this.setState({ nextLocation: nextLocation, confirmed: false });
      return false;
    }
  };
  render() {
    const {
      children,
      fitClassNames,
      saveError,
      clearSaveError,
      push,
    } = this.props;
    const { nextLocation } = this.state;

    return (
      <div className={fitClassNames}>
        {children}
        <Modal isOpen={saveError != null}>
          <ModalContent
            title={t`There was an error saving`}
            formModal
            onClose={clearSaveError}
          >
            <p className="mb4">{saveError}</p>
            <div className="ml-auto">
              <Button onClick={clearSaveError}>{t`OK`}</Button>
            </div>
          </ModalContent>
        </Modal>
        <Modal isOpen={nextLocation}>
          <ConfirmContent
            title={t`You have unsaved changes`}
            message={t`Do you want to leave this page and discard your changes?`}
            onClose={() => {
              this.setState({ nextLocation: null });
            }}
            onAction={() => {
              this.setState({ nextLocation: null, confirmed: true }, () => {
                push(nextLocation.pathname, nextLocation.state);
              });
            }}
          />
        </Modal>
      </div>
    );
  }
}
