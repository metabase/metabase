/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { Route } from "react-router";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import Modal from "metabase/components/Modal";

export const getParentPath = (route, location) => {
  const fullPathSegments = location.pathname.split("/");
  const routeSegments = route.path.split("/");

  fullPathSegments.splice(-routeSegments.length);

  return fullPathSegments.join("/");
};

const ModalWithRoute = (ComposedModal, modalProps = {}) =>
  connect(null, { onChangeLocation: push })(
    class extends Component {
      static displayName = `ModalWithRoute[${
        ComposedModal.displayName || ComposedModal.name
      }]`;

      onClose = () => {
        const { location, route } = this.props;

        const parentPath = getParentPath(route, location);
        this.props.onChangeLocation(parentPath);
      };

      render() {
        return (
          <Modal {...modalProps} onClose={this.onClose}>
            <ComposedModal {...this.props} onClose={this.onClose} />
          </Modal>
        );
      }
    },
  );

// react-router Route wrapper that handles routed modals
export class ModalRoute extends Route {
  static createRouteFromReactElement(element) {
    const { modal, modalProps } = element.props;

    if (modal) {
      element = React.cloneElement(element, {
        component: ModalWithRoute(modal, modalProps),
      });

      return Route.createRouteFromReactElement(element);
    } else {
      throw new Error("`modal` property is missing from ModalRoute");
    }
  }
}
