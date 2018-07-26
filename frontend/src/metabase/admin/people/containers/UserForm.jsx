import React from "react";
import EntityForm from "metabase/entities/containers/EntityForm";
import ModalContent from "metabase/components/ModalContent";

const UserForm = ({ user, onClose, ...props }) => (
  <ModalContent
    title={user && user.id != null ? "Edit User" : "New user"}
    onClose={onClose}
  >
    <EntityForm entityType="users" entityObject={user} {...props} />
  </ModalContent>
);

export default UserForm;
