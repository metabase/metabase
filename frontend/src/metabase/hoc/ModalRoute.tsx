import { Component } from "react";
import * as React from "react";
import { Route } from "react-router";
import { push } from "react-router-redux";
import { connect } from "react-redux";
import type { LocationDescriptor } from "history";

import Modal from "metabase/components/Modal";

type IRoute = {
  path: string;
};

export const getParentPath = (route: IRoute, location: Location) => {
  const fullPathSegments = location.pathname.split("/");
  const routeSegments = route.path.split("/");

  fullPathSegments.splice(-routeSegments.length);

  return fullPathSegments.join("/");
};

type ComposedModalProps = {
  onClose: () => void;
};

interface WrappedModalRouteProps {
  route: IRoute;
  location: Location;
  onChangeLocation: (nextLocation: LocationDescriptor) => void;
}

const ModalWithRoute = (
  ComposedModal: React.ComponentType<ComposedModalProps>,
  modalProps = {},
) => {
  class ModalRouteComponent extends Component<WrappedModalRouteProps> {
    static displayName: string = `ModalWithRoute[${
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
  }

  return connect(null, { onChangeLocation: push })(ModalRouteComponent);
};

interface ModalRouteProps {
  path: string;
  modal: React.ComponentType<ComposedModalProps>;
  modalProps?: unknown;
}

// react-router Route wrapper that handles routed modals
class _ModalRoute extends Route {
  static createRouteFromReactElement(element: React.ReactElement) {
    const { modal, modalProps } = element.props;

    if (modal) {
      element = React.cloneElement(element, {
        component: ModalWithRoute(modal, modalProps),
      });

      // @ts-expect-error - Route.createRouteFromReactElement is not typed
      return Route.createRouteFromReactElement(element);
    } else {
      throw new Error("`modal` property is missing from ModalRoute");
    }
  }
}

// Casting ModalRoute as there's no way to properly type its props
// ModalRoute extends react-router's Route which is not generic,
// so it's impossible to extend Route's props.
export const ModalRoute =
  _ModalRoute as unknown as React.ComponentType<ModalRouteProps>;
