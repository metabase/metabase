import type { Location, LocationDescriptor } from "history";
import { Component } from "react";
import * as React from "react";
import { Route } from "react-router";
import { push } from "react-router-redux";

import { Modal } from "metabase/common/components/Modal";
import { connect } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";

type RouteParams = Record<string, string | undefined>;

type IRoute = {
  path: string;
};

export const getParentPath = (route: IRoute, location: Location) => {
  // If instance has a custom url we need to exclude its subpath
  const siteUrlSegments = (MetabaseSettings.get("site-url") ?? "").split("/");
  const subPath = siteUrlSegments.slice(3).join("/");

  let pathName: string;
  if (subPath) {
    const subPathSplit = location.pathname.split(subPath);

    pathName =
      subPathSplit.length === 1
        ? subPathSplit[0]
        : subPathSplit.slice(1).join(subPath);
  } else {
    pathName = location.pathname;
  }

  const fullPathSegments = pathName.split("/");
  const routeSegments = route.path.split("/");

  fullPathSegments.splice(-routeSegments.length);

  return fullPathSegments.join("/");
};

export type ComposedModalProps<
  P extends RouteParams = RouteParams,
  Q = unknown,
> = {
  params: P;
  location: Location<Q>;
  onClose: () => void;
};

interface WrappedModalRouteProps {
  route: IRoute;
  params: RouteParams;
  location: Location;
  onChangeLocation: (nextLocation: LocationDescriptor) => void;
}

const ModalWithRoute = (
  ComposedModal: React.ComponentType<ComposedModalProps>,
  modalProps = {},
  noWrap = false,
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
      if (noWrap) {
        return <ComposedModal {...this.props} onClose={this.onClose} />;
      }

      return (
        <Modal {...modalProps} onClose={this.onClose}>
          <ComposedModal {...this.props} onClose={this.onClose} />
        </Modal>
      );
    }
  }

  return connect(null, { onChangeLocation: push })(ModalRouteComponent);
};

// Base props that any modal rendered by ModalRoute must accept.
// Modal components typically narrow `params` to specific keys (e.g., { alertId?: string }),
// but they must accept the full ComposedModalProps shape.
type ModalComponentProps = {
  params: RouteParams;
  location: Location;
  onClose: () => void;
};

interface ModalRouteProps {
  path: string;
  modal: React.ComponentType<ModalComponentProps>;
  modalProps?: unknown;
  noWrap?: boolean;
}

// react-router Route wrapper that handles routed modals
class _ModalRoute extends Route {
  static createRouteFromReactElement(element: React.ReactElement) {
    const { modal, modalProps, noWrap } = element.props;

    if (modal) {
      element = React.cloneElement(element, {
        component: ModalWithRoute(modal, modalProps, noWrap),
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
