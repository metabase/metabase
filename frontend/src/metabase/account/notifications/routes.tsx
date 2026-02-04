import type { ComponentType } from "react";
import { Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";

import HelpModal from "./components/HelpModal";
import { DeleteAlertModal } from "./containers/ArchiveAlertModal";
import ArchivePulseModal from "./containers/ArchivePulseModal";
import { NotificationsApp } from "./containers/NotificationsApp";
import { UnsubscribeAlertModal } from "./containers/UnsubscribeAlertModal";
import UnsubscribePulseModal from "./containers/UnsubscribePulseModal";

// ModalRoute passes additional props (params, location) to modals via spread,
// but its type only declares onClose. Cast to ComponentType to work around this.
// TODO: Fix ModalRoute types to properly declare the props it passes to modals.
const modal = <T,>(component: T) =>
  component as ComponentType<{ onClose: () => void }>;

const getRoutes = (): React.JSX.Element => (
  <Route path="notifications" component={NotificationsApp}>
    <ModalRoute path="help" modal={modal(HelpModal)} />
    <ModalRoute
      path="alert/:alertId/archive"
      modal={modal(DeleteAlertModal)}
      noWrap
    />
    <ModalRoute
      path="pulse/:pulseId/archive"
      modal={modal(ArchivePulseModal)}
    />
    <ModalRoute
      path="alert/:alertId/unsubscribe"
      modal={modal(UnsubscribeAlertModal)}
      noWrap
    />
    <ModalRoute
      path="pulse/:pulseId/unsubscribe"
      modal={modal(UnsubscribePulseModal)}
    />
  </Route>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default getRoutes;
