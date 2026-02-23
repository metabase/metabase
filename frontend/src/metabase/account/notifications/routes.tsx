import {
  Outlet,
  type RouteObject,
  useLocation,
  useParams,
} from "react-router-dom";

import { createModalRoute } from "metabase/routing";

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
  const params = useParams<{ alertId?: string }>();
  const location = useLocation();

  return (
    <DeleteAlertModal params={params} location={location} onClose={onClose} />
  );
};

const ArchivePulseModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useParams<{ pulseId?: string }>();
  const location = useLocation();

  return (
    <ArchivePulseModal params={params} location={location} onClose={onClose} />
  );
};

const UnsubscribeAlertModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useParams<{ alertId?: string }>();
  return <UnsubscribeAlertModal params={params} onClose={onClose} />;
};

const UnsubscribePulseModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useParams<{ pulseId?: string }>();
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
