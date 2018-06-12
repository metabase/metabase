import React, { Component } from "react";
import { Route } from "react-router";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import Modal from "metabase/components/Modal";

const ModalWithRoute = ComposedModal =>
  connect(null, { onChangeLocation: push })(
    class extends Component {
      static displayName = `ModalWithRoute[${ComposedModal.displayName ||
        ComposedModal.name}]`;

      onClose = () => {
        const { location: { pathname } } = this.props;
        const urlWithoutLastSegment = pathname.substring(
          0,
          pathname.lastIndexOf("/"),
        );
        this.props.onChangeLocation(urlWithoutLastSegment);
      };

      render() {
        return (
          <Modal onClose={this.onClose}>
            <ComposedModal {...this.props} onClose={this.onClose} />
          </Modal>
        );
      }
    },
  );

// react-router Route wrapper that handles routed modals
export class ModalRoute extends Route {
  static createRouteFromReactElement(element) {
    const { modal } = element.props;

    if (modal) {
      element = React.cloneElement(element, {
        component: ModalWithRoute(modal),
      });

      return Route.createRouteFromReactElement(element);
    } else {
      throw new Error("`modal` property is missing from ModalRoute");
    }
  }
}
