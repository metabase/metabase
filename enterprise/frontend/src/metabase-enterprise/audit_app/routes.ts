import type { ReactNode } from "react";

import { modalRoute } from "metabase/common/components/ModalRoute";

import { UnsubscribeUserModal } from "./containers/UnsubscribeUserModal/UnsubscribeUserModal";

export const getUserMenuRoutes = (): ReactNode =>
  modalRoute("unsubscribe", UnsubscribeUserModal, { noWrap: true });
