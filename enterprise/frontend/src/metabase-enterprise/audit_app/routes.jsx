import _ from "underscore";

import { ModalRoute } from "metabase/hoc/ModalRoute";

import UnsubscribeUserModal from "./containers/UnsubscribeUserModal/UnsubscribeUserModal";

export const getUserMenuRotes = () => (
  <ModalRoute path="unsubscribe" modal={UnsubscribeUserModal} />
);
