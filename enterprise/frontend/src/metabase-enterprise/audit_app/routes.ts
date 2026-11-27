import {
  type ModalComponentProps,
  modalRoute,
} from "metabase/common/components/ModalRoute";
import { PluginPlaceholderModal } from "metabase/plugins/components/PluginPlaceholder";
import { featureGatedComponent } from "metabase-enterprise/settings/feature-gated-route";

import { UnsubscribeUserModal } from "./containers/UnsubscribeUserModal/UnsubscribeUserModal";

export const getUserMenuRoutes = (): React.ReactNode =>
  modalRoute(
    "unsubscribe",
    featureGatedComponent<ModalComponentProps>(
      "audit_app",
      UnsubscribeUserModal,
      PluginPlaceholderModal,
    ),
  );
