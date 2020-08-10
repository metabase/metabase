import React from "react";
import { compose } from "redux";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "ttag";

import User from "metabase/entities/users";

const EditUserModal = ({ user, onClose, ...props }) => (
  <User.ModalForm
    {...props}
    title={t`Edit user`}
    user={user}
    onSaved={onClose}
    onClose={onClose}
  />
);

export default compose(
  User.load({ id: (state, props) => props.params.userId }),
  connect(
    null,
    { onClose: goBack },
  ),
)(EditUserModal);
