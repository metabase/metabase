import React from "react";
import { t } from "c-3po";

import EntityForm from "metabase/entities/containers/EntityForm";
import ModalContent from "metabase/components/ModalContent";

const UserForm = ({ user, onClose, ...props }) => (
  <ModalContent
    title={user && user.id != null ? t`Edit user` : t`New user`}
    onClose={onClose}
  >
    <EntityForm entityType="users" entityObject={user} {...props} />
  </ModalContent>
);

export default UserForm;
