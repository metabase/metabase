import React from "react";
import { compose } from "redux";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "c-3po";

import User from "metabase/entities/users";

import ModalContent from "metabase/components/ModalContent";

const EditUserModal = ({ user, onClose, ...props }) => (
  <ModalContent title={t`Edit user`} onClose={onClose}>
    <User.Form user={user} {...props} onSaved={onClose} />
  </ModalContent>
);

export default compose(
  User.loader({ id: (state, props) => props.params.userId }),
  connect(null, { onClose: goBack }),
)(EditUserModal);
