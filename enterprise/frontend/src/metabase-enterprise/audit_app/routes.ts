import { modalRoute } from "metabase/common/components/ModalRoute";

import { UnsubscribeUserModal } from "./containers/UnsubscribeUserModal/UnsubscribeUserModal";

export const getUserMenuRoutes = (): React.ReactNode =>
  modalRoute("unsubscribe", UnsubscribeUserModal, { noWrap: true });
