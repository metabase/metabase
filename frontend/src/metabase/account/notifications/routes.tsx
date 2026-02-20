import type { Location } from "history";
import { Outlet, type RouteObject } from "react-router-dom";

import {
  createModalRoute,
  useCompatLocation,
  useCompatParams,
} from "metabase/routing/compat";

import { HelpModal } from "./components/HelpModal";
import { DeleteAlertModal } from "./containers/ArchiveAlertModal";
import { ArchivePulseModal } from "./containers/ArchivePulseModal";
import { NotificationsApp } from "./containers/NotificationsApp";
import { UnsubscribeAlertModal } from "./containers/UnsubscribeAlertModal";
import { UnsubscribePulseModal } from "./containers/UnsubscribePulseModal";

const NotificationsAppWithOutlet = () => (
  <NotificationsApp>
    <Outlet />
  </NotificationsApp>
);

const DeleteAlertModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useCompatParams<{ alertId?: string }>();
  const location = useCompatLocation();

  return (
    <DeleteAlertModal
      params={params}
      location={
        location as unknown as Location<{
          unsubscribed?: boolean;
        }>
      }
      onClose={onClose}
    />
  );
};

const ArchivePulseModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useCompatParams<{ pulseId?: string }>();
  const location = useCompatLocation();

  return (
    <ArchivePulseModal
      params={params}
      location={location as unknown as Location}
      onClose={onClose}
    />
  );
};

const UnsubscribeAlertModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useCompatParams<{ alertId?: string }>();
  return <UnsubscribeAlertModal params={params} onClose={onClose} />;
};

const UnsubscribePulseModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useCompatParams<{ pulseId?: string }>();
  return <UnsubscribePulseModal params={params} onClose={onClose} />;
};

export function getNotificationRoutes() {
  return null;
}

export function getNotificationRouteObjects(): RouteObject[] {
  return [
    {
      path: "notifications",
      element: <NotificationsAppWithOutlet />,
      children: [
        createModalRoute("help", HelpModal),
        createModalRoute(
          "alert/:alertId/archive",
          DeleteAlertModalWithRouteProps,
          {
            noWrap: true,
          },
        ),
        createModalRoute(
          "pulse/:pulseId/archive",
          ArchivePulseModalWithRouteProps,
        ),
        createModalRoute(
          "alert/:alertId/unsubscribe",
          UnsubscribeAlertModalWithRouteProps,
          {
            noWrap: true,
          },
        ),
        createModalRoute(
          "pulse/:pulseId/unsubscribe",
          UnsubscribePulseModalWithRouteProps,
        ),
      ],
    },
  ];
}
