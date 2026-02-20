import type { LocationDescriptor } from "history";
import * as React from "react";
import { Route, useLocation, useNavigate, useParams } from "react-router-dom";

import { Modal } from "metabase/common/components/Modal";
import MetabaseSettings from "metabase/lib/settings";

type RouteParams = Record<string, string | undefined>;

type IRoute = {
  path: string;
};

export const getParentPath = (
  route: IRoute,
  location: { pathname: string },
) => {
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

export type ComposedModalProps<P extends RouteParams = RouteParams, Q = any> = {
  params: P;
  location: Q;
  onClose: () => void;
};

const ModalWithRoute = (
  route: IRoute,
  ComposedModal: React.ComponentType<any>,
  modalProps = {},
  noWrap = false,
) => {
  function ModalRouteComponent() {
    const params = useParams<RouteParams>();
    const location = useLocation();
    const navigate = useNavigate();

    const onClose = React.useCallback(() => {
      const parentPath = getParentPath(route, location as { pathname: string });
      navigate(parentPath as LocationDescriptor);
    }, [location, navigate]);

    const composedModalProps = {
      ...modalProps,
      params,
      location,
      onClose,
    };

    if (noWrap) {
      return <ComposedModal {...composedModalProps} />;
    }

    return (
      <Modal {...modalProps} onClose={onClose}>
        <ComposedModal {...composedModalProps} />
      </Modal>
    );
  }

  ModalRouteComponent.displayName = `ModalWithRoute[${
    ComposedModal.displayName || ComposedModal.name
  }]`;

  return ModalRouteComponent;
};

// Base props that any modal rendered by ModalRoute must accept.
// Modal components typically narrow `params` to specific keys (e.g., { alertId?: string }),
// but they must accept the full ComposedModalProps shape.
type ModalComponentProps = {
  params: RouteParams;
  location: any;
  onClose: () => void;
};

interface ModalRouteProps {
  path: string;
  modal: React.ComponentType<ModalComponentProps>;
  modalProps?: Record<string, unknown>;
  noWrap?: boolean;
}

export const ModalRoute = ({
  path,
  modal,
  modalProps,
  noWrap = false,
}: ModalRouteProps) => {
  if (!modal) {
    throw new Error("`modal` property is missing from ModalRoute");
  }

  const Component = ModalWithRoute({ path }, modal, modalProps, noWrap);
  return <Route path={path} element={<Component />} />;
};
