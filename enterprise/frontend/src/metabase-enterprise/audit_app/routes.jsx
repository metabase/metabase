import { modalRoute } from "metabase/common/components/ModalRoute";

import { UnsubscribeUserModal } from "./containers/UnsubscribeUserModal/UnsubscribeUserModal";

export const getUserMenuRotes = () =>
  modalRoute("unsubscribe", UnsubscribeUserModal, { noWrap: true });
