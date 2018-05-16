import React, { Component } from "react";
import PropTypes from "prop-types";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import { initialize } from "../permissions";
import { getIsDirty } from "../selectors";
import { t } from "c-3po";
import ConfirmContent from "metabase/components/ConfirmContent.jsx";
import Modal from "metabase/components/Modal.jsx";

const mapStateToProps = (state, props) => ({
  isDirty: getIsDirty(state, props),
});

const mapDispatchToProps = {
  initialize,
  push,
};

@withRouter
@connect(mapStateToProps, mapDispatchToProps)
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
    return (
      <div className={this.props.fitClassNames}>
        {this.props.children}
        <Modal isOpen={this.state.nextLocation}>
          <ConfirmContent
            title={t`You have unsaved changes`}
            message={t`Do you want to leave this page and discard your changes?`}
            onClose={() => {
              this.setState({ nextLocation: null });
            }}
            onAction={() => {
              const { nextLocation } = this.state;
              this.setState({ nextLocation: null, confirmed: true }, () => {
                this.props.push(nextLocation.pathname, nextLocation.state);
              });
            }}
          />
        </Modal>
      </div>
    );
  }
}
